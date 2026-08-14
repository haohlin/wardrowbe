'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';

import { api, ApiError, getAccessToken, NetworkError, setAccessToken } from '@/lib/api';

export type TryOnStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface TryOn {
  id: string;
  user_id: string;
  outfit_id: string;
  status: TryOnStatus;
  person_image_path: string;
  person_image_url: string;
  source_image_url: string;
  original_person_image_url: string;
  comparison_image_path?: string | null;
  result_image_path?: string | null;
  result_image_url?: string | null;
  image_url?: string | null;
  generated_image_url?: string | null;
  model?: string | null;
  error?: string | null;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
}

export interface TryOnListResponse {
  items: TryOn[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
}

export interface TryOnQuota {
  used: number;
  limit: number;
  remaining: number;
  bonus_credits: number;
  unlimited: boolean;
  can_generate: boolean;
}

export interface CreateTryOnInput {
  outfitId: string;
  photo?: File;
  useSavedPhoto?: boolean;
}

export function buildTryOnFormData({ outfitId, photo, useSavedPhoto }: CreateTryOnInput): FormData {
  if (!photo && !useSavedPhoto) throw new Error('Person photo is required');

  const form = new FormData();
  form.append('outfit_id', outfitId);
  if (photo) form.append('photo', photo);
  else form.append('use_saved_photo', 'true');
  return form;
}

export function tryOnNeedsPolling(records: Array<Pick<TryOn, 'status'>>): boolean {
  return records.some((record) => record.status === 'pending' || record.status === 'processing');
}

function useSetTokenIfAvailable() {
  const { data: session } = useSession();
  if (session?.accessToken) setAccessToken(session.accessToken as string);
}

function authHeaders(token?: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function postMultipart<T>(endpoint: string, form: FormData, fallback: string, token?: string | null): Promise<T> {
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      body: form,
      credentials: 'include',
      headers: authHeaders(token),
    });
  } catch {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new NetworkError('You appear to be offline. Please check your connection.');
    }
    throw new NetworkError('Unable to connect to server. Please try again.');
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const detail = typeof data.detail === 'string' ? data.detail : undefined;
    throw new ApiError(detail || fallback, response.status, data);
  }

  return response.json();
}

export function useTryOns({
  outfitId,
  page = 1,
  pageSize = 30,
}: {
  outfitId?: string;
  page?: number;
  pageSize?: number;
} = {}) {
  const { status } = useSession();
  useSetTokenIfAvailable();

  const params: Record<string, string> = {
    page: String(page),
    page_size: String(pageSize),
  };
  if (outfitId) params.outfit_id = outfitId;

  return useQuery({
    queryKey: ['tryons', outfitId, page, pageSize],
    queryFn: () => api.get<TryOnListResponse>('/tryon', { params }),
    enabled: status !== 'loading',
    refetchInterval: (query) => {
      const records = (query.state.data as TryOnListResponse | undefined)?.items ?? [];
      return tryOnNeedsPolling(records) ? 5000 : false;
    },
    refetchIntervalInBackground: true,
  });
}

export function useTryOnQuota() {
  const { status } = useSession();
  useSetTokenIfAvailable();

  return useQuery({
    queryKey: ['tryon-quota'],
    queryFn: () => api.get<TryOnQuota>('/tryon/quota'),
    enabled: status !== 'loading',
  });
}

export function useCreateTryOn() {
  const queryClient = useQueryClient();
  const { data: session } = useSession();

  return useMutation({
    mutationFn: (input: CreateTryOnInput) =>
      postMultipart<TryOn>(
        '/api/v1/tryon/outfit',
        buildTryOnFormData(input),
        'Failed to start virtual try-on',
        session?.accessToken || getAccessToken(),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tryons'] });
      queryClient.invalidateQueries({ queryKey: ['tryon-quota'] });
    },
  });
}

export function useDeleteTryOn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (tryOnId: string) => api.delete<void>(`/tryon/${tryOnId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tryons'] });
      queryClient.invalidateQueries({ queryKey: ['tryon-quota'] });
    },
  });
}

export function useUploadTryOnPhoto() {
  const queryClient = useQueryClient();
  const { data: session } = useSession();

  return useMutation({
    mutationFn: (photo: File) => {
      const form = new FormData();
      form.append('photo', photo);
      return postMultipart(
        '/api/v1/users/me/tryon-photo',
        form,
        'Failed to save try-on photo',
        session?.accessToken || getAccessToken(),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-profile'] });
    },
  });
}

export function useDeleteTryOnPhoto() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.delete<void>('/users/me/tryon-photo'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-profile'] });
    },
  });
}

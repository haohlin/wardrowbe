import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildTryOnFormData,
  tryOnNeedsPolling,
  useCreateTryOn,
  useTryOns,
} from '@/lib/hooks/use-tryon';

function createWrapper(queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('try-on hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds native-compatible form data for a new person photo', () => {
    const photo = new File(['photo'], 'person.jpg', { type: 'image/jpeg' });
    const form = buildTryOnFormData({ outfitId: 'outfit-1', photo });

    expect(form.get('outfit_id')).toBe('outfit-1');
    expect(form.get('photo')).toBe(photo);
    expect(form.get('use_saved_photo')).toBeNull();
  });

  it('builds native-compatible form data for saved person photo reuse', () => {
    const form = buildTryOnFormData({ outfitId: 'outfit-1', useSavedPhoto: true });

    expect(form.get('outfit_id')).toBe('outfit-1');
    expect(form.get('photo')).toBeNull();
    expect(form.get('use_saved_photo')).toBe('true');
  });

  it('requires a person photo when no saved photo is selected', () => {
    expect(() => buildTryOnFormData({ outfitId: 'outfit-1' })).toThrow('Person photo is required');
  });

  it('polls only queued or active generations', () => {
    expect(tryOnNeedsPolling([{ status: 'pending' }])).toBe(true);
    expect(tryOnNeedsPolling([{ status: 'processing' }])).toBe(true);
    expect(tryOnNeedsPolling([{ status: 'completed' }, { status: 'failed' }])).toBe(false);
  });

  it('loads paged history for selected outfit and keeps active jobs refreshed', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        items: [{ id: 'tryon-1', status: 'processing' }],
        total: 1,
        page: 1,
        page_size: 30,
        has_more: false,
      }),
    } as Response);

    const { result } = renderHook(() => useTryOns({ outfitId: 'outfit-1' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.data?.items).toHaveLength(1));
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/v1/tryon?page=1&page_size=30&outfit_id=outfit-1',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(result.current.refetch).toBeTypeOf('function');
  });

  it('queues a try-on with multipart data and refreshes history', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      status: 202,
      json: async () => ({ id: 'tryon-1', status: 'pending' }),
    } as Response);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useCreateTryOn(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({
        outfitId: 'outfit-1',
        photo: new File(['photo'], 'person.jpg', { type: 'image/jpeg' }),
      });
    });

    const [, request] = vi.mocked(global.fetch).mock.calls[0];
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/v1/tryon/outfit',
      expect.objectContaining({ method: 'POST', body: expect.any(FormData) }),
    );
    expect((request as RequestInit).body).toBeInstanceOf(FormData);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['tryons'] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['tryon-quota'] });
  });
});

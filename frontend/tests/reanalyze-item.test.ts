import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/lib/api', () => ({
  api: {
    post: vi.fn(async () => ({ job_id: 'job-1', status: 'queued' })),
  },
  getAccessToken: vi.fn(),
  setAccessToken: vi.fn(),
  ApiError: class ApiError extends Error {},
  NetworkError: class NetworkError extends Error {},
}))

import { useReanalyzeItem } from '@/lib/hooks/use-items'

function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('useReanalyzeItem', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('invalidates both list and detail queries so an open item dialog receives AI-filled fields', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    queryClient.setQueryData(['items'], { items: [], total: 0, page: 1, page_size: 20, has_more: false })
    queryClient.setQueryData(['item', 'item-1'], {
      id: 'item-1',
      name: undefined,
      type: 'unknown',
      brand: undefined,
      primary_color: undefined,
      notes: undefined,
      status: 'ready',
    })

    const { result } = renderHook(() => useReanalyzeItem(), {
      wrapper: createWrapper(queryClient),
    })

    await result.current.mutateAsync('item-1')

    await waitFor(() => {
      expect(queryClient.getQueryState(['items'])?.isInvalidated).toBe(true)
      expect(queryClient.getQueryState(['item', 'item-1'])?.isInvalidated).toBe(true)
    })
  })
})

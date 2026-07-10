import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) => React.createElement('img', { alt, src }),
}))

vi.mock('@/lib/hooks/use-features', () => ({
  useFeatures: () => ({ data: { background_removal: false } }),
}))

vi.mock('@/lib/hooks/use-items', () => ({
  useUpdateItem: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteItem: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReanalyzeItem: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRotateImage: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRemoveBackground: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useLogWash: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useWashHistory: () => ({ data: [] }),
  useItemWearStats: () => ({ data: null }),
  useItemWearHistory: () => ({ data: [] }),
  useAddItemImage: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteItemImage: () => ({ mutate: vi.fn(), isPending: false }),
  useSetPrimaryImage: () => ({ mutate: vi.fn(), isPending: false }),
}))

import { ItemDetailDialog } from '@/components/item-detail-dialog'
import { AiTaskProvider } from '@/lib/ai-task-context'
import { Item } from '@/lib/types'

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 'item-1',
    user_id: 'user-1',
    type: 'unknown',
    subtype: undefined,
    name: undefined,
    brand: undefined,
    notes: undefined,
    favorite: false,
    image_path: '/test.jpg',
    image_url: '/test.jpg',
    tags: { colors: [], style: [], season: [] },
    colors: [],
    primary_color: undefined,
    status: 'ready',
    ai_processed: false,
    wear_count: 0,
    suggestion_count: 0,
    acceptance_count: 0,
    wears_since_wash: 0,
    wash_interval: undefined,
    needs_wash: false,
    effective_wash_interval: 3,
    additional_images: [],
    is_archived: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function renderDialog(item: Item) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    React.createElement(QueryClientProvider, { client: queryClient },
      React.createElement(AiTaskProvider, null,
        React.createElement(ItemDetailDialog, { item, open: true, onOpenChange: vi.fn() })
      )
    )
  )
}

describe('ItemDetailDialog AI analysis form sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates empty edit-screen fields when the same item receives AI-filled fields', async () => {
    const initial = makeItem()
    const { rerender } = renderDialog(initial)

    fireEvent.click(screen.getByTitle('Edit item'))
    expect(screen.getByPlaceholderText('Item name')).toHaveValue('')
    expect(screen.getByPlaceholderText('Brand name')).toHaveValue('')
    expect(screen.getByPlaceholderText('Additional notes...')).toHaveValue('')

    const analyzed = makeItem({
      name: 'Tan hooded jacket',
      type: 'jacket',
      brand: 'Patagonia',
      primary_color: 'tan',
      notes: 'A tan hooded outdoor jacket.',
      ai_processed: true,
      ai_confidence: 0.92,
      updated_at: '2026-01-01T00:01:00Z',
    })

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    rerender(
      React.createElement(QueryClientProvider, { client: queryClient },
        React.createElement(AiTaskProvider, null,
          React.createElement(ItemDetailDialog, { item: analyzed, open: true, onOpenChange: vi.fn() })
        )
      )
    )

    expect(screen.getByPlaceholderText('Item name')).toHaveValue('Tan hooded jacket')
    expect(screen.getByPlaceholderText('Brand name')).toHaveValue('Patagonia')
    expect(screen.getByPlaceholderText('Additional notes...')).toHaveValue('A tan hooded outdoor jacket.')
  })
})

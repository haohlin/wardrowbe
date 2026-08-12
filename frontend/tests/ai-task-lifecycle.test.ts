import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('global AI task lifecycle', () => {
  it('mounts task state above dashboard pages and displays a global banner', () => {
    const layout = read('app/dashboard/layout.tsx')
    expect(layout).toContain('AiTaskProvider')
    expect(layout).toContain('AiTaskBanner')
  })

  it('tracks long-running AI actions through the shared provider', () => {
    for (const path of [
      'app/dashboard/suggest/page.tsx',
      'components/generate-pairings-dialog.tsx',
      'components/studio/details-panel.tsx',
      'components/item-detail-dialog.tsx',
    ]) {
      const source = read(path)
      expect(source).toContain('useAiTasks')
      expect(source).toContain('startTask')
    }
  })
})

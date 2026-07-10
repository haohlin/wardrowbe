import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function read(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('AI task lifecycle UI', () => {
  it('keeps long-running AI suggestion work in a provider outside the Suggest page', () => {
    const providerSource = read('lib/ai-task-context.tsx')
    const providersSource = read('app/providers.tsx')
    const suggestSource = read('app/dashboard/suggest/page.tsx')

    expect(providerSource).toContain('AiTaskProvider')
    expect(providerSource).toContain('startTask')
    expect(providerSource).toContain('Promise<T>')
    expect(providerSource).toContain('activeTask')
    expect(providerSource).toContain('lastCompletedTask')
    expect(providersSource).toContain('<AiTaskProvider>')
    expect(suggestSource).toContain('useAiTasks')
    expect(suggestSource).toContain('startTask<AutoSuggestResponse>')
    expect(suggestSource).not.toContain('const [isGenerating, setIsGenerating] = useState(false)')
  })

  it('renders a global top-of-page loading banner with the specific AI task label', () => {
    const dashboardLayoutSource = read('app/dashboard/layout.tsx')
    const bannerSource = read('components/ai-task-banner.tsx')

    expect(dashboardLayoutSource).toContain('AiTaskBanner')
    expect(bannerSource).toContain('useAiTasks')
    expect(bannerSource).toContain('Loader2')
    expect(bannerSource).toContain('activeTask.label')
    expect(bannerSource).toContain('AI is working')
  })

  it('uses the persistent AI task tracker for other long-running AI actions too', () => {
    const studioSource = read('components/studio/details-panel.tsx')
    const pairingsSource = read('components/generate-pairings-dialog.tsx')
    const itemDetailSource = read('components/item-detail-dialog.tsx')

    for (const source of [studioSource, pairingsSource, itemDetailSource]) {
      expect(source).toContain('useAiTasks')
      expect(source).toContain('startTask')
    }

    expect(studioSource).not.toContain('const [aiLoading, setAiLoading] = useState(false)')
    expect(pairingsSource).toContain('type: \'pairing-generation\'')
    expect(itemDetailSource).toContain('type: \'background-removal\'')
  })
})

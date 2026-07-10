import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const suggestSource = readFileSync(join(process.cwd(), 'app/dashboard/suggest/page.tsx'), 'utf8')
const typesSource = readFileSync(join(process.cwd(), 'lib/types.ts'), 'utf8')

describe('AI suggestion auto flow', () => {
  it('does not expose existing/generate mode choices to the user', () => {
    expect(suggestSource).not.toContain('How should I suggest?')
    expect(suggestSource).not.toContain('Select existing outfit')
    expect(suggestSource).not.toContain('Generate new outfit with AI')
    expect(suggestSource).not.toContain('Find Existing Outfit')
    expect(suggestSource).not.toContain('suggestMode')
  })

  it('uses one AI suggestion button that asks the backend to choose cached previews or generate new ones', () => {
    expect(suggestSource).toContain('/outfits/suggest/auto')
    expect(suggestSource).toContain('AutoSuggestResponse')
    expect(suggestSource).toContain('availableOutfits')
    expect(suggestSource).toContain('setAvailableOutfits')
    expect(suggestSource).toContain('AI Suggestion')
    expect(typesSource).toContain('AutoSuggestResponse')
  })

  it('tracks shown outfit combos and sends excluded_combinations on Try Another', () => {
    expect(suggestSource).toContain('shownOutfitCombos')
    expect(suggestSource).toContain('mergeShownCombos')
    expect(suggestSource).toContain('request.excluded_combinations')
    expect(suggestSource).toContain('handleGenerate({ excludeShownCombos: true, excludedCombos })')
    expect(typesSource).toContain('excluded_combinations?: string[][]')
  })

  it('lets the user force a new AI outfit from the existing pool while excluding every displayed pool combo', () => {
    expect(suggestSource).toContain('onGenerateNew')
    expect(suggestSource).toContain('Create a new AI outfit')
    expect(suggestSource).toContain('handleGenerateFromPool')
    expect(suggestSource).toContain('mergeShownCombos(shownOutfitCombos, availableOutfits ?? [])')
    expect(suggestSource).toContain('request.force_generate = true')
    expect(typesSource).toContain('force_generate?: boolean')
  })

  it('surfaces no-combo wardrobe advice with example clothing photos when generation is exhausted', () => {
    expect(suggestSource).toContain('WardrobeGapAdvice')
    expect(suggestSource).toContain('examplePhotos')
    expect(suggestSource).toContain('No available wardrobe combo')
    expect(suggestSource).toContain('compatible shoes')
  })
})

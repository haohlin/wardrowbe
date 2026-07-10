import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const recommendationSource = readFileSync(join(process.cwd(), '../backend/app/services/recommendation_service.py'), 'utf8')
const promptSource = readFileSync(join(process.cwd(), '../backend/app/prompts/recommendation.txt'), 'utf8')
const outfitHookSource = readFileSync(join(process.cwd(), 'lib/hooks/use-outfits.ts'), 'utf8')
const detailSource = readFileSync(join(process.cwd(), 'app/dashboard/outfits/[id]/page.tsx'), 'utf8')
const suggestSource = readFileSync(join(process.cwd(), 'app/dashboard/suggest/page.tsx'), 'utf8')

describe('AI suggestion bilingual text contract', () => {
  it('asks the model for both English and Simplified Chinese suggestion copy in one response', () => {
    expect(promptSource).toContain('localized_text')
    expect(promptSource).toContain('English')
    expect(promptSource).toContain('Simplified Chinese')
    expect(promptSource).toContain('Do not show both languages at the same time')
    expect(recommendationSource).toContain('localized_text')
  })

  it('exposes localized suggestion text to the frontend and switches by current language', () => {
    expect(outfitHookSource).toContain('localized_text')
    expect(detailSource).toContain('localizedText')
    expect(detailSource).toContain("language === 'zh'")
    expect(suggestSource).toContain('localizedText')
    expect(suggestSource).toContain("language === 'zh'")
  })
})

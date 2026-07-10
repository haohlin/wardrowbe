import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const detailSource = readFileSync(join(process.cwd(), 'app/dashboard/outfits/[id]/page.tsx'), 'utf8')
const suggestSource = readFileSync(join(process.cwd(), 'app/dashboard/suggest/page.tsx'), 'utf8')
const typesSource = readFileSync(join(process.cwd(), 'lib/hooks/use-outfits.ts'), 'utf8')

describe('AI suggestion debug and localized rendering contract', () => {
  it('exposes backend debug prompt payload to generated outfit UI only as an explicit debug panel', () => {
    expect(typesSource).toContain('debug_prompt')
    expect(suggestSource).toContain('Debug AI prompt')
    expect(detailSource).toContain('Debug AI prompt')
  })

  it('marks AI-generated copy regions as runtime-i18n skipped so EN/ZH switching is driven only by localized_text', () => {
    expect(suggestSource).toContain('data-i18n-skip')
    expect(detailSource).toContain('data-i18n-skip')
  })
})

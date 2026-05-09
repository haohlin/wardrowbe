import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const suggestSource = readFileSync(join(process.cwd(), 'app/dashboard/suggest/page.tsx'), 'utf8')

describe('suggest page i18n hook usage', () => {
  it('destructures the translation function used by the suggest page and result card', () => {
    expect(suggestSource).toContain('const { t, language } = useI18n();')
    expect(suggestSource).not.toContain('const { language } = useI18n();')
  })
})

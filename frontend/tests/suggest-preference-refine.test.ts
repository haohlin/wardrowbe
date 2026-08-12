import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const suggest = readFileSync(join(process.cwd(), 'app/dashboard/suggest/page.tsx'), 'utf8')
const types = readFileSync(join(process.cwd(), 'lib/types.ts'), 'utf8')

describe('suggestion preference and refinement', () => {
  it('sends a bounded free-text preference', () => {
    expect(types).toContain('preference_note?: string')
    expect(suggest).toContain('request.preference_note')
    expect(suggest).toContain('maxLength={500}')
  })

  it('can refine the displayed suggestion', () => {
    expect(suggest).toContain('refinementNote')
    expect(suggest).toContain("t('refine.title')")
    expect(suggest).toContain('handleRefine')
  })
})

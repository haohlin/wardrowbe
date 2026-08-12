import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const suggest = readFileSync(join(process.cwd(), 'app/dashboard/suggest/page.tsx'), 'utf8')
const types = readFileSync(join(process.cwd(), 'lib/types.ts'), 'utf8')

describe('session suggestion diversity', () => {
  it('remembers shown item combinations and sends exclusions', () => {
    expect(types).toContain('excluded_combinations?: string[][]')
    expect(suggest).toContain('shownOutfitCombos')
    expect(suggest).toContain('request.excluded_combinations')
  })

  it('bounds client history and clears it for a new request', () => {
    expect(suggest).toContain('.slice(-20)')
    expect(suggest).toContain('setShownOutfitCombos([])')
  })
})

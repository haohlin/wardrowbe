import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const suggest = readFileSync(join(process.cwd(), 'app/dashboard/suggest/page.tsx'), 'utf8')
const types = readFileSync(join(process.cwd(), 'lib/types.ts'), 'utf8')

describe('saved outfit reuse', () => {
  it('uses auto suggestion response mode before requesting fresh AI', () => {
    expect(types).toContain('interface AutoSuggestResponse')
    expect(types).toContain("mode: 'existing' | 'generated'")
    expect(suggest).toContain("'/outfits/suggest/auto'")
    expect(suggest).toContain('result.outfits[0]')
  })

  it('can explicitly request fresh generation', () => {
    expect(types).toContain('force_generate?: boolean')
    expect(suggest).toContain('request.force_generate = true')
  })
})

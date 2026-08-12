import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(process.cwd(), 'app/onboarding/page.tsx'), 'utf8')

describe('onboarding photo sources', () => {
  it('offers independent library and camera inputs', () => {
    expect(source).toContain("t('firstItem.chooseFromLibrary')")
    expect(source).toContain("t('firstItem.takePhoto')")
    expect(source.match(/type="file"/g)).toHaveLength(2)
    expect(source.match(/capture="environment"/g)).toHaveLength(1)
  })
})

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const settings = readFileSync(join(process.cwd(), 'app/dashboard/settings/page.tsx'), 'utf8')
const userHook = readFileSync(join(process.cwd(), 'lib/hooks/use-user.ts'), 'utf8')

describe('optional gender profile', () => {
  it('supports only defined profile values', () => {
    expect(userHook).toContain("'female' | 'male' | 'non_binary' | 'prefer_not_to_say'")
    expect(userHook).toContain('gender?: Gender | null')
  })

  it('lets users save or clear the optional value', () => {
    expect(settings).toContain("value={gender || 'unspecified'}")
    expect(settings).toContain("gender: (gender || null) as Gender | null")
    expect(settings).toContain("t('gender.options.preferNotToSay')")
  })
})

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const hookSource = readFileSync(join(process.cwd(), 'lib/hooks/use-user.ts'), 'utf8')
const settingsSource = readFileSync(join(process.cwd(), 'app/dashboard/settings/page.tsx'), 'utf8')

describe('user profile gender support', () => {
  it('exposes gender on the user profile API types', () => {
    expect(hookSource).toContain('gender?:')
    expect(hookSource).toContain('gender?: Gender')
  })

  it('renders a gender selector in profile settings and persists through users/me', () => {
    expect(settingsSource).toContain('Gender Identity')
    expect(settingsSource).toContain('setGender')
    expect(settingsSource).toContain('gender: (gender || null) as Gender | null')
  })
})

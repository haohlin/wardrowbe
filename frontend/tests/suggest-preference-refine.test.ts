import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const suggestSource = readFileSync(join(process.cwd(), 'app/dashboard/suggest/page.tsx'), 'utf8')
const typesSource = readFileSync(join(process.cwd(), 'lib/types.ts'), 'utf8')

describe('suggest preference and refinement inputs', () => {
  it('sends a free-text preference note with suggestion requests', () => {
    expect(typesSource).toContain('preference_note?: string')
    expect(suggestSource).toContain('preferenceNote')
    expect(suggestSource).toContain('request.preference_note')
  })

  it('renders a refinement input for tweaking a generated suggestion', () => {
    expect(suggestSource).toContain('refinementNote')
    expect(suggestSource).toContain('Adjust this suggestion')
    expect(suggestSource).toContain('Tweak Suggestion')
  })
})

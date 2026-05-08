import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const onboardingSource = readFileSync(
  join(process.cwd(), 'app/onboarding/page.tsx'),
  'utf8'
)

function labelBlock(label: string): string {
  const match = onboardingSource.match(
    new RegExp(`<label[\\s\\S]*?${label}[\\s\\S]*?</label>`)
  )
  expect(match, `Could not find label block for ${label}`).not.toBeNull()
  return match![0]
}

describe('onboarding photo upload on iPhone Chrome', () => {
  it('offers a photo library upload input without forcing camera capture', () => {
    const libraryBlock = labelBlock('Choose from Library')

    expect(libraryBlock).toMatch(
      /aria-label="Choose photo from library"[\s\S]*?type="file"[\s\S]*?accept="image\/\*"/
    )
    expect(libraryBlock).not.toContain('capture="environment"')
  })

  it('keeps a separate take-photo input for direct camera capture', () => {
    const cameraBlock = labelBlock('Take Photo')

    expect(cameraBlock).toMatch(
      /aria-label="Take photo with camera"[\s\S]*?type="file"[\s\S]*?accept="image\/\*"[\s\S]*?capture="environment"/
    )
  })
})

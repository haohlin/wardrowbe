import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const dialogSource = readFileSync(
  join(process.cwd(), 'components/add-item-dialog.tsx'),
  'utf8'
)
const hookSource = readFileSync(
  join(process.cwd(), 'lib/hooks/use-items.ts'),
  'utf8'
)

describe('bulk add experience', () => {
  it('keeps HEIC/HEIF visible as supported formats for bulk upload', () => {
    expect(dialogSource).toContain("'.heic'")
    expect(dialogSource).toContain("'.heif'")
    expect(dialogSource).toMatch(/JPEG, PNG, WebP, or HEIC/)
  })

  it('lets each bulk image carry the same editable fields as single add', () => {
    expect(dialogSource).toContain('interface BulkFileMetadata')
    expect(dialogSource).toContain('updateBulkFileMetadata')
    expect(dialogSource).toContain('Bulk item details')
    expect(dialogSource).toContain('bulk-type-')
    expect(dialogSource).toContain('bulk-name-')
    expect(dialogSource).toContain('bulk-brand-')
    expect(dialogSource).toContain('bulk-color-')
    expect(dialogSource).toContain('bulk-notes-')
  })

  it('submits aligned metadata JSON alongside bulk images', () => {
    expect(hookSource).toContain('BulkCreateItemInput')
    expect(hookSource).toContain("formData.append('metadata', JSON.stringify(metadata))")
  })
})

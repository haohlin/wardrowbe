import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const dialog = readFileSync(join(process.cwd(), 'components/add-item-dialog.tsx'), 'utf8')
const hook = readFileSync(join(process.cwd(), 'lib/hooks/use-items.ts'), 'utf8')

describe('bulk upload metadata', () => {
  it('keeps editable metadata for every selected file', () => {
    expect(dialog).toContain('interface BulkFileMetadata')
    expect(dialog).toContain('updateBulkFileMetadata')
    expect(dialog).toContain('bulk-name-')
    expect(dialog).toContain('bulk-brand-')
    expect(dialog).toContain('bulk-color-')
    expect(dialog).toContain('bulk-notes-')
  })

  it('sends metadata aligned with each upload chunk', () => {
    expect(hook).toContain("formData.append('metadata', JSON.stringify(metadata))")
    expect(hook).toContain('chunkMetadata')
  })

  it('keeps the bulk action area visible while editing', () => {
    expect(dialog).toContain('data-testid="bulk-upload-actions"')
    expect(dialog).toContain('sticky bottom-0')
  })
})

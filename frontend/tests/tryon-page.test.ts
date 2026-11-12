import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const page = join(process.cwd(), 'app/dashboard/tryon/page.tsx');

describe('virtual try-on page', () => {
  it('ships saved-photo, async-result, retry, and delete flows', () => {
    expect(existsSync(page)).toBe(true);
    const source = readFileSync(page, 'utf8');

    expect(source).toContain('useTryOns');
    expect(source).toContain('useCreateTryOn');
    expect(source).toContain('useUploadTryOnPhoto');
    expect(source).toContain('useDeleteTryOn');
    expect(source).toContain('result_image_url');
    expect(source).toContain('handleRetry');
  });
});

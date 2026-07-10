import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { translateVisibleText } from '@/lib/i18n'

const learningPageSource = readFileSync(join(process.cwd(), 'app/dashboard/learning/page.tsx'), 'utf8')
const learningHookSource = readFileSync(join(process.cwd(), 'lib/hooks/use-learning.ts'), 'utf8')

describe('AI Learning page regressions', () => {
  it('keeps Date as a calendar label but translates Date occasion/style as dating context', () => {
    expect(translateVisibleText('Date', 'zh')).toBe('日期')
    expect(learningPageSource).toContain('formatLearningCategoryLabel')
    expect(learningPageSource).toContain("t('occasion.date')")
  })

  it('gives visible feedback and refetches after recompute completes', () => {
    expect(learningPageSource).toContain("toast.success('Learning profile recomputed')")
    expect(learningPageSource).toContain("toast.error('Failed to recompute learning profile')")
    expect(learningHookSource).toContain('await queryClient.invalidateQueries')
    expect(learningHookSource).toContain('await queryClient.refetchQueries')
  })
})

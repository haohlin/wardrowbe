import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { translateVisibleText } from '@/lib/i18n'

const i18nSource = readFileSync(join(process.cwd(), 'lib/i18n.tsx'), 'utf8')

describe('Chinese interface coverage', () => {
  it('restores English even when the runtime bridge first observes already-Chinese component text', () => {
    expect(translateVisibleText('仪表盘', 'en')).toBe('Dashboard')
    expect(translateVisibleText('设置', 'en')).toBe('Settings')
    expect(translateVisibleText('切换语言', 'en')).toBe('Switch language')
  })

  it('keeps Chinese punctuation tight when translating a React text-node prefix', () => {
    expect(translateVisibleText('Welcome back, ', 'zh')).toBe('欢迎回来，')
  })

  it('has a runtime visible-text translator for pages, dialogs, dropdowns, placeholders, and dynamic toasts', () => {
    expect(i18nSource).toContain('translateVisibleText')
    expect(i18nSource).toContain('MutationObserver')
    expect(i18nSource).toContain('placeholder')
    expect(i18nSource).toContain('aria-label')
    expect(i18nSource).toContain('title')
  })

  it('covers representative visible text from every major page area', () => {
    const requiredPhrases = [
      'Loading your wardrobe...',
      'Add Items',
      'Bulk Upload',
      'All types',
      'All occasions',
      'Suggest Outfit',
      'Notifications',
      'Family Feed',
      'Acceptance Rate',
      'Default Occasion',
      'Choose photo from library',
      'Delete this item?',
      'Generate Pairings',
      'Comments (optional)',
      'No custom endpoints configured. Using the secure server default above.',
      'Next Scheduled',
      'Set Up Schedule',
      'Quick Actions',
      'Family Outfits',
      'Upload selected images',
      'Ready to upload',
      'Fill any fields you know, or leave them empty and let AI detect them.',
      'Most common colors in your wardrobe',
      'Outfits Generated',
      'No other members yet',
      'Pending Invites',
      'No recommendation history',
      'Compute Now',
      'Notification channel added',
      'No items in your wardrobe yet. Add items first.',
      'My Looks',
      'Recommendation Settings',
      'Get personalized outfit suggestions based on weather and occasion',
      'Gender Identity',
      'Used for fit-aware outfit suggestions and realistic model try-on images.',
      'Preference for this suggestion',
      'Adjust this suggestion',
      'Tweak Suggestion',
      'Generate new outfit with AI',
    ]

    for (const phrase of requiredPhrases) {
      expect(i18nSource).toContain(`'${phrase}'`)
    }
  })
})

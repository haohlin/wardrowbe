import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LanguageProvider, useI18n } from '@/lib/i18n'

function AiCopyToggleHarness() {
  const { language, setLanguage } = useI18n()
  const localizedText = {
    en: {
      headline: 'Fresh Minimal Date',
      highlights: ['English highlight'],
      styling_tip: 'English tip',
    },
    zh: {
      headline: '清爽极简约会',
      highlights: ['中文亮点'],
      styling_tip: '中文提示',
    },
  }
  const copy = localizedText[language]
  return (
    <div>
      <button type="button" onClick={() => setLanguage('zh')}>中文</button>
      <button type="button" onClick={() => setLanguage('en')}>English</button>
      <section data-i18n-skip="true">
        <h1>{copy.headline}</h1>
        <p>{copy.highlights[0]}</p>
        <p>{copy.styling_tip}</p>
      </section>
    </div>
  )
}

describe('AI copy language switching', () => {
  it('can switch AI-generated localized copy from EN to ZH and back to EN', async () => {
    render(
      <LanguageProvider>
        <AiCopyToggleHarness />
      </LanguageProvider>
    )

    expect(await screen.findByText('Fresh Minimal Date')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '中文' }))
    expect(await screen.findByText('清爽极简约会')).toBeInTheDocument()
    expect(screen.queryByText('Fresh Minimal Date')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'English' }))
    expect(await screen.findByText('Fresh Minimal Date')).toBeInTheDocument()
    expect(screen.queryByText('清爽极简约会')).not.toBeInTheDocument()
  })
})

'use client';

import { Languages } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';

export function LanguageToggle() {
  const { language, setLanguage, t } = useI18n();
  const nextLanguage = language === 'en' ? 'zh' : 'en';

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setLanguage(nextLanguage)}
      aria-label={t('language.toggleLabel')}
      className="gap-1.5 px-2"
    >
      <Languages className="h-4 w-4" />
      <span className="text-xs font-medium" data-i18n-skip="true">{language === 'en' ? '中文' : 'EN'}</span>
    </Button>
  );
}

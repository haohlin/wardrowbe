'use client';

import { AlertCircle, CheckCircle2, Loader2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { type AiTaskStatus, useAiTasks } from '@/lib/ai-task-context';

const STATUS_VIEW: Record<AiTaskStatus, { icon: React.ReactNode; titleKey: 'working' | 'failed' | 'finished' }> = {
  running: { icon: <Loader2 className="h-4 w-4 animate-spin text-primary" />, titleKey: 'working' },
  error: { icon: <AlertCircle className="h-4 w-4 text-destructive" />, titleKey: 'failed' },
  success: { icon: <CheckCircle2 className="h-4 w-4 text-green-600" />, titleKey: 'finished' },
};

export function AiTaskBanner() {
  const t = useTranslations('dashboard.aiTasks');
  const { activeTask, lastCompletedTask, clearCompletedTask } = useAiTasks();
  const task = activeTask ?? lastCompletedTask;
  if (!task) return null;

  const view = STATUS_VIEW[task.status];
  const running = task.status === 'running';
  const failed = task.status === 'error';

  return (
    <div className="border-b bg-primary/5 px-4 py-2 sm:px-6 lg:px-8" role="status" aria-live="polite">
      <div className="mx-auto flex max-w-5xl items-center gap-3 text-sm">
        {view.icon}
        <div className="min-w-0 flex-1">
          <p className="font-medium">{t(view.titleKey)}</p>
          <p className="truncate text-muted-foreground">{failed ? task.errorMessage || task.label : task.label}</p>
        </div>
        {!running && (
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => clearCompletedTask(task.id)} aria-label={t('dismiss')}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

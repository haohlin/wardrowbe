'use client';

import { AlertCircle, CheckCircle2, Loader2, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAiTasks } from '@/lib/ai-task-context';

export function AiTaskBanner() {
  const { activeTask, lastCompletedTask, clearCompletedTask } = useAiTasks();
  const task = activeTask ?? lastCompletedTask;

  if (!task) return null;

  const label = activeTask ? activeTask.label : task.label;
  const isRunning = task.status === 'running';
  const isError = task.status === 'error';

  return (
    <div
      className="border-b bg-primary/5 px-4 py-2 sm:px-6 lg:px-8"
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto flex max-w-5xl items-center gap-3 text-sm">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background shadow-sm ring-1 ring-border">
          {isRunning ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          ) : isError ? (
            <AlertCircle className="h-4 w-4 text-destructive" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            {isRunning ? 'AI is working' : isError ? 'AI task needs attention' : 'AI task finished'}
          </p>
          <p className="truncate text-muted-foreground">
            {isError ? task.errorMessage || label : label}
          </p>
        </div>
        {isRunning && <Sparkles className="hidden h-4 w-4 text-primary sm:block" />}
        {!isRunning && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => clearCompletedTask(task.id)}
            aria-label="Dismiss AI task status"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

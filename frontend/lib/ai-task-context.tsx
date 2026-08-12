'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

export type AiTaskStatus = 'running' | 'success' | 'error';

export interface AiTask<T = unknown> {
  id: string;
  type: string;
  label: string;
  status: AiTaskStatus;
  startedAt: number;
  completedAt?: number;
  result?: T;
  errorMessage?: string;
}

interface StartTaskInput {
  id?: string;
  type: string;
  label: string;
}

interface AiTaskContextValue {
  tasks: AiTask[];
  activeTask: AiTask | null;
  lastCompletedTask: AiTask | null;
  startTask: <T>(input: StartTaskInput, runner: () => Promise<T>) => Promise<T>;
  clearCompletedTask: (id: string) => void;
}

const AiTaskContext = createContext<AiTaskContextValue | null>(null);

function taskId(type: string) {
  return `${type}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'AI task failed';
}

export function AiTaskProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<AiTask[]>([]);
  const running = useRef(new Map<string, Promise<unknown>>());

  const startTask = useCallback(async <T,>(input: StartTaskInput, runner: () => Promise<T>) => {
    const id = input.id ?? taskId(input.type);
    const existing = running.current.get(id) as Promise<T> | undefined;
    if (existing) return existing;

    setTasks((current) => [{ ...input, id, status: 'running', startedAt: Date.now() }, ...current.filter((task) => task.id !== id)]);
    const promise = runner()
      .then((result) => {
        setTasks((current) => current.map((task) => task.id === id
          ? { ...task, status: 'success', completedAt: Date.now(), result }
          : task));
        return result;
      })
      .catch((error) => {
        setTasks((current) => current.map((task) => task.id === id
          ? { ...task, status: 'error', completedAt: Date.now(), errorMessage: errorMessage(error) }
          : task));
        throw error;
      })
      .finally(() => running.current.delete(id));

    running.current.set(id, promise);
    return promise;
  }, []);

  const clearCompletedTask = useCallback((id: string) => {
    setTasks((current) => current.filter((task) => task.id !== id || task.status === 'running'));
  }, []);

  const value = useMemo<AiTaskContextValue>(() => ({
    tasks,
    activeTask: tasks.find((task) => task.status === 'running') ?? null,
    lastCompletedTask: tasks.find((task) => task.status !== 'running') ?? null,
    startTask,
    clearCompletedTask,
  }), [tasks, startTask, clearCompletedTask]);

  return <AiTaskContext.Provider value={value}>{children}</AiTaskContext.Provider>;
}

export function useAiTasks() {
  const context = useContext(AiTaskContext);
  if (!context) throw new Error('useAiTasks must be used within AiTaskProvider');
  return context;
}

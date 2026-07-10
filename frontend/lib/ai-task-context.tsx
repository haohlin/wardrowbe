'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';

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
  clearTask: (id: string) => void;
  clearCompletedTask: (id: string) => void;
}

const AiTaskContext = createContext<AiTaskContextValue | null>(null);

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'AI task failed. Please try again.';
}

function createTaskId(type: string) {
  const random = Math.random().toString(36).slice(2, 10);
  return `${type}:${Date.now()}:${random}`;
}

export function AiTaskProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<AiTask[]>([]);
  const runningPromises = useRef(new Map<string, Promise<unknown>>());

  const clearTask = useCallback((id: string) => {
    setTasks((current) => current.filter((task) => task.id !== id));
    runningPromises.current.delete(id);
  }, []);

  const clearCompletedTask = useCallback((id: string) => {
    setTasks((current) => current.filter((task) => task.id !== id || task.status === 'running'));
  }, []);

  const startTask = useCallback(async <T,>(input: StartTaskInput, runner: () => Promise<T>): Promise<T> => {
    const id = input.id ?? createTaskId(input.type);
    const existing = runningPromises.current.get(id) as Promise<T> | undefined;
    if (existing) return existing;

    const startedAt = Date.now();
    const pendingTask: AiTask = {
      id,
      type: input.type,
      label: input.label,
      status: 'running',
      startedAt,
    };

    setTasks((current) => [pendingTask, ...current.filter((task) => task.id !== id)]);

    const promise = runner()
      .then((result) => {
        setTasks((current) => current.map((task) => (
          task.id === id
            ? { ...task, status: 'success', completedAt: Date.now(), result }
            : task
        )));
        return result;
      })
      .catch((error) => {
        setTasks((current) => current.map((task) => (
          task.id === id
            ? { ...task, status: 'error', completedAt: Date.now(), errorMessage: getErrorMessage(error) }
            : task
        )));
        throw error;
      })
      .finally(() => {
        runningPromises.current.delete(id);
      });

    runningPromises.current.set(id, promise);
    return promise;
  }, []);

  const value = useMemo<AiTaskContextValue>(() => {
    const activeTask = tasks.find((task) => task.status === 'running') ?? null;
    const lastCompletedTask = tasks.find((task) => task.status !== 'running') ?? null;

    return {
      tasks,
      activeTask,
      lastCompletedTask,
      startTask,
      clearTask,
      clearCompletedTask,
    };
  }, [tasks, startTask, clearTask, clearCompletedTask]);

  return (
    <AiTaskContext.Provider value={value}>
      {children}
    </AiTaskContext.Provider>
  );
}

export function useAiTasks() {
  const context = useContext(AiTaskContext);
  if (!context) {
    throw new Error('useAiTasks must be used within AiTaskProvider');
  }
  return context;
}

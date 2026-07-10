import React, { useState } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AiTaskProvider, useAiTasks } from '@/lib/ai-task-context'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('AiTaskProvider', () => {
  it('keeps a task running after the starting page unmounts and exposes the completed result later', async () => {
    const pending = deferred<{ id: string }>()

    function Starter({ onHide }: { onHide: () => void }) {
      const { startTask } = useAiTasks()
      return (
        <button
          type="button"
          onClick={() => {
            void startTask(
              { type: 'outfit-suggestion', label: 'Creating your AI outfit suggestion and try-on preview...' },
              () => pending.promise
            )
            onHide()
          }}
        >
          Start
        </button>
      )
    }

    function Observer() {
      const { activeTask, lastCompletedTask } = useAiTasks()
      return (
        <div>
          <p data-testid="active-label">{activeTask?.label ?? 'none'}</p>
          <p data-testid="completed-result">
            {lastCompletedTask?.status === 'success'
              ? (lastCompletedTask.result as { id: string }).id
              : 'none'}
          </p>
        </div>
      )
    }

    function Harness() {
      const [showStarter, setShowStarter] = useState(true)
      return (
        <AiTaskProvider>
          {showStarter && <Starter onHide={() => setShowStarter(false)} />}
          <Observer />
        </AiTaskProvider>
      )
    }

    render(<Harness />)

    fireEvent.click(screen.getByText('Start'))
    expect(screen.queryByText('Start')).not.toBeInTheDocument()
    expect(screen.getByTestId('active-label')).toHaveTextContent('Creating your AI outfit suggestion and try-on preview...')

    await act(async () => {
      pending.resolve({ id: 'outfit-123' })
      await pending.promise
    })

    expect(screen.getByTestId('active-label')).toHaveTextContent('none')
    expect(screen.getByTestId('completed-result')).toHaveTextContent('outfit-123')
  })
})

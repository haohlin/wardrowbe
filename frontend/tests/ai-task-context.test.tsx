import React, { useState } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AiTaskProvider, useAiTasks } from '@/lib/ai-task-context'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

describe('AiTaskProvider', () => {
  it('keeps task state after initiating component unmounts', async () => {
    const pending = deferred<{ id: string }>()

    function Starter({ hide }: { hide: () => void }) {
      const { startTask } = useAiTasks()
      return <button onClick={() => { void startTask({ type: 'test', label: 'Working' }, () => pending.promise); hide() }}>Start</button>
    }

    function Observer() {
      const { activeTask, lastCompletedTask } = useAiTasks()
      return <div>{activeTask?.label ?? (lastCompletedTask?.result as { id: string } | undefined)?.id ?? 'none'}</div>
    }

    function Harness() {
      const [show, setShow] = useState(true)
      return <AiTaskProvider>{show && <Starter hide={() => setShow(false)} />}<Observer /></AiTaskProvider>
    }

    render(<Harness />)
    fireEvent.click(screen.getByText('Start'))
    expect(screen.getByText('Working')).toBeInTheDocument()

    await act(async () => { pending.resolve({ id: 'done' }); await pending.promise })
    expect(screen.getByText('done')).toBeInTheDocument()
  })
})

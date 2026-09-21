import { describe, expect, it, vi } from 'vitest'
import { Pool } from './pool'

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('Pool', () => {
  it('rejects a limit below one', () => {
    expect(() => new Pool(0)).toThrow(RangeError)
  })

  it('never exceeds its concurrency limit', async () => {
    const pool = new Pool(2)
    let running = 0
    let peak = 0

    const makeTask = () => async () => {
      running += 1
      peak = Math.max(peak, running)
      await tick()
      running -= 1
    }

    for (let i = 0; i < 10; i += 1) pool.add(makeTask())

    // Drain: every task yields at least once per tick.
    for (let i = 0; i < 30; i += 1) await tick()

    expect(peak).toBe(2)
    expect(pool.activeCount).toBe(0)
    expect(pool.pendingCount).toBe(0)
  })

  it('keeps draining after a task throws', async () => {
    const pool = new Pool(1)
    const order: string[] = []

    pool.add(async () => {
      order.push('first')
      throw new Error('encoder died')
    })
    pool.add(async () => {
      order.push('second')
    })

    for (let i = 0; i < 10; i += 1) await tick()

    expect(order).toEqual(['first', 'second'])
  })

  it('runs a single task immediately when the pool is empty', async () => {
    const pool = new Pool(1)
    const task = vi.fn(async () => undefined)
    pool.add(task)
    expect(pool.activeCount).toBe(1)
    await tick()
    expect(task).toHaveBeenCalledTimes(1)
  })

  it('drops queued work without touching running tasks', async () => {
    const pool = new Pool(1)
    const started = vi.fn(async () => undefined)
    const dropped = vi.fn(async () => undefined)

    pool.add(started)
    pool.add(dropped)
    pool.add(dropped)

    expect(pool.clearWaiting()).toBe(2)
    for (let i = 0; i < 10; i += 1) await tick()

    expect(started).toHaveBeenCalledTimes(1)
    expect(dropped).not.toHaveBeenCalled()
  })
})

/**
 * Fixed-size async pool. Video encoding uses a limit of 1 because the wasm module
 * is a singleton; image encoding uses 2 workers so a batch of photos stays quick
 * without exhausting memory on phones.
 */
export class Pool {
  private running = 0
  private readonly waiting: Array<() => Promise<void>> = []

  constructor(private readonly limit: number) {
    if (limit < 1) throw new RangeError('Pool limit must be at least 1')
  }

  get activeCount(): number {
    return this.running
  }

  get pendingCount(): number {
    return this.waiting.length
  }

  add(task: () => Promise<void>): void {
    if (this.running < this.limit) {
      void this.run(task)
      return
    }
    this.waiting.push(task)
  }

  private async run(task: () => Promise<void>): Promise<void> {
    this.running += 1
    try {
      await task()
    } catch {
      // A task is expected to record its own failure; the pool must keep draining.
    } finally {
      this.running -= 1
      const next = this.waiting.shift()
      if (next) void this.run(next)
    }
  }

  /** Drops queued work that has not started. Already-running tasks keep going. */
  clearWaiting(): number {
    const dropped = this.waiting.length
    this.waiting.length = 0
    return dropped
  }
}

import { describe, expect, it } from 'vitest'
import { initialQueueState, isRunnable, isTerminallyRejected, queueReducer, summarise } from './reducer'
import type { NewQueueItem } from './reducer'
import { makeError } from '@/utils/errors'
import type { CompressionResult, QueueItem } from '@/types/media'

const file = (name: string, size: number) => {
  const blob = new File([new Uint8Array(Math.min(size, 64))], name, { type: 'video/mp4' })
  Object.defineProperty(blob, 'size', { value: size })
  return blob
}

const newItem = (id: string, size: number, kind: 'image' | 'video' = 'video'): NewQueueItem => ({
  id,
  lineageId: `line-${id}`,
  generation: 0,
  source: file(`${id}.mp4`, size),
  kind,
})

const result = (size: number): CompressionResult => ({
  file: file('out.mp4', size),
  sizeBytes: size,
  mimeType: 'video/mp4',
  dimensions: { width: 1920, height: 1080 },
  codecLabel: 'H.264 · MP4 · AAC',
  elapsedMs: 1200,
})

describe('queueReducer', () => {
  it('adds items in the idle state', () => {
    const state = queueReducer(initialQueueState, {
      type: 'add',
      items: [newItem('a', 100), newItem('b', 200)],
      now: 1,
    })
    expect(state.items).toHaveLength(2)
    expect(state.items.every((item) => item.status === 'idle')).toBe(true)
  })

  it('returns the same reference when adding nothing', () => {
    const state = queueReducer(initialQueueState, { type: 'add', items: [], now: 1 })
    expect(state).toBe(initialQueueState)
  })

  it('walks idle → queued → processing → completed', () => {
    let state = queueReducer(initialQueueState, { type: 'add', items: [newItem('a', 100)], now: 1 })
    state = queueReducer(state, { type: 'enqueue', ids: ['a'], now: 2 })
    expect(state.items[0]?.status).toBe('queued')

    state = queueReducer(state, { type: 'start', id: 'a', now: 3 })
    expect(state.items[0]?.status).toBe('processing')

    state = queueReducer(state, { type: 'progress', id: 'a', ratio: 0.42, label: 'Encoding' })
    expect(state.items[0]?.progress).toBe(0.42)

    state = queueReducer(state, { type: 'complete', id: 'a', result: result(31), now: 4 })
    expect(state.items[0]?.status).toBe('completed')
    expect(state.items[0]?.result?.sizeBytes).toBe(31)
    expect(state.items[0]?.error).toBeUndefined()
  })

  it('clamps progress into 0–1', () => {
    let state = queueReducer(initialQueueState, { type: 'add', items: [newItem('a', 100)], now: 1 })
    state = queueReducer(state, { type: 'progress', id: 'a', ratio: 4, label: 'Encoding' })
    expect(state.items[0]?.progress).toBe(1)
    state = queueReducer(state, { type: 'progress', id: 'a', ratio: -2, label: 'Encoding' })
    expect(state.items[0]?.progress).toBe(0)
  })

  it('lets a failed item be re-queued', () => {
    let state = queueReducer(initialQueueState, { type: 'add', items: [newItem('a', 100)], now: 1 })
    state = queueReducer(state, {
      type: 'fail',
      id: 'a',
      error: makeError('codec-failed', 'The encoder stopped early', 'Retry.'),
      now: 2,
    })
    expect(state.items[0]?.status).toBe('failed')
    state = queueReducer(state, { type: 'enqueue', ids: ['a'], now: 3 })
    expect(state.items[0]?.status).toBe('queued')
    expect(state.items[0]?.error).toBeUndefined()
  })

  it('refuses to re-queue a completed item, protecting finished output', () => {
    let state = queueReducer(initialQueueState, { type: 'add', items: [newItem('a', 100)], now: 1 })
    state = queueReducer(state, { type: 'complete', id: 'a', result: result(31), now: 2 })
    state = queueReducer(state, { type: 'enqueue', ids: ['a'], now: 3 })
    expect(state.items[0]?.status).toBe('completed')
  })

  it('cancels only rows that are queued or processing', () => {
    let state = queueReducer(initialQueueState, {
      type: 'add',
      items: [newItem('a', 100), newItem('b', 100)],
      now: 1,
    })
    state = queueReducer(state, { type: 'enqueue', ids: ['a', 'b'], now: 2 })
    state = queueReducer(state, { type: 'start', id: 'a', now: 3 })
    state = queueReducer(state, { type: 'complete', id: 'b', result: result(31), now: 4 })

    state = queueReducer(state, { type: 'cancel', id: 'a' })
    state = queueReducer(state, { type: 'cancel', id: 'b' })
    expect(state.items.find((item) => item.id === 'a')?.status).toBe('cancelled')
    expect(state.items.find((item) => item.id === 'b')?.status).toBe('completed')
  })

  it('removes a single row during processing without touching the rest', () => {
    let state = queueReducer(initialQueueState, {
      type: 'add',
      items: [newItem('a', 100), newItem('b', 100)],
      now: 1,
    })
    state = queueReducer(state, { type: 'remove', id: 'a' })
    expect(state.items.map((item) => item.id)).toEqual(['b'])
  })

  it('clears completed rows and keeps failures visible', () => {
    let state = queueReducer(initialQueueState, {
      type: 'add',
      items: [newItem('a', 100), newItem('b', 100)],
      now: 1,
    })
    state = queueReducer(state, { type: 'complete', id: 'a', result: result(31), now: 2 })
    state = queueReducer(state, {
      type: 'fail',
      id: 'b',
      error: makeError('decode-failed', 'Could not read this file', 'Check the file.'),
      now: 3,
    })
    state = queueReducer(state, { type: 'clearCompleted' })
    expect(state.items.map((item) => item.id)).toEqual(['b'])
  })

  it('ignores an unknown id instead of throwing', () => {
    const state = queueReducer(initialQueueState, { type: 'progress', id: 'missing', ratio: 1, label: 'x' })
    expect(state).toBe(initialQueueState)
  })
})

describe('summarise', () => {
  it('averages progress across queued and processing rows only', () => {
    let state = queueReducer(initialQueueState, {
      type: 'add',
      items: [newItem('a', 100), newItem('b', 100), newItem('c', 100)],
      now: 1,
    })
    state = queueReducer(state, { type: 'enqueue', ids: ['a', 'b', 'c'], now: 2 })
    state = queueReducer(state, { type: 'start', id: 'a', now: 3 })
    state = queueReducer(state, { type: 'progress', id: 'a', ratio: 0.6, label: 'Encoding' })
    state = queueReducer(state, { type: 'start', id: 'b', now: 4 })
    state = queueReducer(state, { type: 'progress', id: 'b', ratio: 0.2, label: 'Encoding' })

    const summary = summarise(state.items)
    expect(summary.processing).toBe(2)
    expect(summary.queued).toBe(1)
    expect(summary.overallRatio).toBeCloseTo((0.6 + 0.2 + 0) / 3, 5)
    expect(summary.anythingRunning).toBe(true)
  })

  it('tallies bytes across finished rows', () => {
    let state = queueReducer(initialQueueState, {
      type: 'add',
      items: [newItem('a', 100_000_000), newItem('b', 50_000_000)],
      now: 1,
    })
    state = queueReducer(state, { type: 'complete', id: 'a', result: result(31_000_000), now: 2 })
    state = queueReducer(state, { type: 'complete', id: 'b', result: result(20_000_000), now: 3 })

    const summary = summarise(state.items)
    expect(summary.completedBytesIn).toBe(150_000_000)
    expect(summary.completedBytesOut).toBe(51_000_000)
    expect(summary.overallRatio).toBe(0)
    expect(summary.anythingRunning).toBe(false)
  })

  it('reports an empty queue without dividing by zero', () => {
    expect(summarise([]).overallRatio).toBe(0)
  })
})

describe('rejected rows', () => {
  it('keeps the status and reason a row arrives with', () => {
    const rejection = makeError('empty-file', 'Empty file', 'notes.png is 0 bytes.')
    const state = queueReducer(initialQueueState, {
      type: 'add',
      items: [
        { ...newItem('bad', 0), status: 'failed', progressLabel: 'Rejected', error: rejection },
        newItem('good', 100),
      ],
      now: 1,
    })

    const bad = state.items.find((item) => item.id === 'bad')
    expect(bad?.status).toBe('failed')
    expect(bad?.error?.title).toBe('Empty file')
    expect(state.items.find((item) => item.id === 'good')?.status).toBe('idle')
  })

  it('does not offer a retry the app cannot honour', () => {
    const rejected: QueueItem = {
      id: 'x',
      lineageId: 'l',
      generation: 0,
      source: file('x.txt', 10),
      kind: 'image',
      status: 'failed',
      progress: 0,
      progressLabel: 'Rejected',
      addedAt: 1,
      error: makeError('unsupported-media', 'Not an image or video', 'Reported as text/plain.'),
    }
    expect(isTerminallyRejected(rejected)).toBe(true)
    expect(isRunnable(rejected)).toBe(false)
  })

  it('does offer a retry for a failure that a different setting could fix', () => {
    const failed: QueueItem = {
      id: 'y',
      lineageId: 'l',
      generation: 0,
      source: file('y.mp4', 10),
      kind: 'video',
      status: 'failed',
      progress: 0,
      progressLabel: 'Failed',
      addedAt: 1,
      error: makeError('codec-failed', 'The encoder stopped early', 'Try a lower resolution.'),
    }
    expect(isTerminallyRejected(failed)).toBe(false)
    expect(isRunnable(failed)).toBe(true)
  })

  it('runs idle and cancelled rows but not queued, processing or completed ones', () => {
    const base: QueueItem = {
      id: 'z',
      lineageId: 'l',
      generation: 0,
      source: file('z.mp4', 10),
      kind: 'video',
      status: 'idle',
      progress: 0,
      progressLabel: 'Ready',
      addedAt: 1,
    }
    expect(isRunnable(base)).toBe(true)
    expect(isRunnable({ ...base, status: 'cancelled' })).toBe(true)
    expect(isRunnable({ ...base, status: 'queued' })).toBe(false)
    expect(isRunnable({ ...base, status: 'processing' })).toBe(false)
    expect(isRunnable({ ...base, status: 'completed' })).toBe(false)
  })
})

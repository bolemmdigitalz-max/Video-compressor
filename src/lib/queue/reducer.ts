import type {
  CompressionResult,
  ErrorCode,
  MediaProbe,
  QueueItem,
  QueueStatus,
  UserFacingError,
} from '@/types/media'

export interface QueueState {
  items: QueueItem[]
}

export interface NewQueueItem {
  id: string
  lineageId: string
  generation: number
  source: File
  kind: 'image' | 'video'
  /**
   * Rows rejected at upload time arrive already terminal. Without these the
   * reducer would reset them to `idle` and the reason for rejection would be lost.
   */
  status?: QueueStatus
  progressLabel?: string
  error?: UserFacingError
}

export type QueueAction =
  | { type: 'add'; items: NewQueueItem[]; now: number }
  | { type: 'enqueue'; ids: string[]; now: number }
  | { type: 'start'; id: string; now: number }
  | { type: 'progress'; id: string; ratio: number; label: string }
  | { type: 'probe'; id: string; probe: MediaProbe }
  | { type: 'probeFailed'; id: string; error: UserFacingError }
  | { type: 'complete'; id: string; result: CompressionResult; now: number }
  | { type: 'fail'; id: string; error: UserFacingError; now: number }
  | { type: 'cancel'; id: string }
  | { type: 'remove'; id: string }
  | { type: 'clearCompleted' }
  | { type: 'clearAll' }

export const initialQueueState: QueueState = { items: [] }

function mapItem(state: QueueState, id: string, patch: (item: QueueItem) => QueueItem): QueueState {
  let changed = false
  const items = state.items.map((item) => {
    if (item.id !== id) return item
    changed = true
    return patch(item)
  })
  return changed ? { items } : state
}

export function queueReducer(state: QueueState, action: QueueAction): QueueState {
  switch (action.type) {
    case 'add': {
      if (action.items.length === 0) return state
      const created: QueueItem[] = action.items.map((item) => ({
        id: item.id,
        lineageId: item.lineageId,
        generation: item.generation,
        source: item.source,
        kind: item.kind,
        status: item.status ?? 'idle',
        progress: 0,
        progressLabel: item.progressLabel ?? 'Waiting to start',
        addedAt: action.now,
        ...(item.error === undefined ? {} : { error: item.error }),
      }))
      return { items: [...state.items, ...created] }
    }

    case 'enqueue': {
      const ids = new Set(action.ids)
      return {
        items: state.items.map((item) =>
          ids.has(item.id) && (item.status === 'idle' || item.status === 'failed' || item.status === 'cancelled')
            ? {
                ...item,
                status: 'queued',
                progress: 0,
                progressLabel: 'Queued',
                error: undefined,
                result: undefined,
              }
            : item,
        ),
      }
    }

    case 'start':
      return mapItem(state, action.id, (item) => ({
        ...item,
        status: 'processing',
        startedAt: action.now,
        finishedAt: undefined,
        error: undefined,
      }))

    case 'progress':
      return mapItem(state, action.id, (item) => ({
        ...item,
        progress: Math.min(1, Math.max(0, action.ratio)),
        progressLabel: action.label,
      }))

    case 'probe':
      return mapItem(state, action.id, (item) => ({ ...item, probe: action.probe, probeError: undefined }))

    case 'probeFailed':
      return mapItem(state, action.id, (item) => ({
        ...item,
        status: 'failed',
        progress: 0,
        progressLabel: 'Could not be read',
        probeError: action.error,
        error: action.error,
      }))

    case 'complete':
      return mapItem(state, action.id, (item) => ({
        ...item,
        status: 'completed',
        progress: 1,
        progressLabel: 'Done',
        result: action.result,
        error: undefined,
        finishedAt: action.now,
      }))

    case 'fail':
      return mapItem(state, action.id, (item) => ({
        ...item,
        status: 'failed',
        progress: 0,
        progressLabel: 'Failed',
        error: action.error,
        finishedAt: action.now,
      }))

    case 'cancel':
      return mapItem(state, action.id, (item) =>
        item.status === 'processing' || item.status === 'queued'
          ? { ...item, status: 'cancelled', progress: 0, progressLabel: 'Cancelled' }
          : item,
      )

    case 'remove':
      return { items: state.items.filter((item) => item.id !== action.id) }

    case 'clearCompleted':
      return { items: state.items.filter((item) => item.status !== 'completed') }

    case 'clearAll':
      return { items: [] }

    default:
      return state
  }
}

/**
 * Failures that a retry cannot fix: the file itself was refused. Showing Retry on
 * these would promise an outcome the app cannot deliver.
 */
const TERMINAL_ERROR_CODES: ReadonlySet<ErrorCode> = new Set([
  'unsupported-media',
  'empty-file',
  'too-large',
])

export function isTerminallyRejected(item: QueueItem): boolean {
  return item.status === 'failed' && item.error !== undefined && TERMINAL_ERROR_CODES.has(item.error.code)
}

/** Rows that Compress will actually pick up. */
export function isRunnable(item: QueueItem): boolean {
  if (item.status === 'idle' || item.status === 'cancelled') return true
  if (item.status !== 'failed') return false
  return !isTerminallyRejected(item)
}

export interface QueueSummary {
  total: number
  queued: number
  processing: number
  completed: number
  failed: number
  cancelled: number
  /** 0–1 across queued + processing rows; finished rows do not count. */
  overallRatio: number
  completedBytesIn: number
  completedBytesOut: number
  anythingRunning: boolean
}

export function summarise(items: readonly QueueItem[]): QueueSummary {
  const summary: QueueSummary = {
    total: items.length,
    queued: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    overallRatio: 0,
    completedBytesIn: 0,
    completedBytesOut: 0,
    anythingRunning: false,
  }

  let progressSum = 0
  let pending = 0

  for (const item of items) {
    switch (item.status as QueueStatus) {
      case 'queued':
        summary.queued += 1
        pending += 1
        break
      case 'processing':
        summary.processing += 1
        pending += 1
        progressSum += item.progress
        break
      case 'completed':
        summary.completed += 1
        summary.completedBytesIn += item.source.size
        summary.completedBytesOut += item.result?.sizeBytes ?? 0
        break
      case 'failed':
        summary.failed += 1
        break
      case 'cancelled':
        summary.cancelled += 1
        break
      case 'idle':
        break
      default:
        break
    }
  }

  summary.overallRatio = pending === 0 ? 0 : progressSum / pending
  summary.anythingRunning = summary.queued + summary.processing > 0
  return summary
}

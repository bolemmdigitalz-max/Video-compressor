import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { initialQueueState, isRunnable, queueReducer, summarise } from '@/lib/queue/reducer'
import type { QueueSummary } from '@/lib/queue/reducer'
import { Pool } from '@/lib/queue/pool'
import { probeImage, toProbeWithAlpha } from '@/lib/image/probeImage'
import { runImageJob } from '@/lib/image/runImageJob'
import { compressVideo, getEngineStatus, loadEngine, onEngineStatus, terminateEngine } from '@/lib/video/engine'
import type { EngineStatus } from '@/lib/video/engine'
import { probeVideo } from '@/lib/video/probe'
import { detectEncodableMimes } from '@/lib/image/capabilities'
import { buildChain, diminishingReturns } from '@/lib/history/generations'
import type { GenerationRow } from '@/lib/history/generations'
import { classifyError, classifyUpload, makeError } from '@/utils/errors'
import { downloadOrExplain, outputNameForGeneration } from '@/utils/download'
import { asZipError, createZip, zipFileName } from '@/lib/zip/zip'
import { defaultVideoSettings } from '@/lib/video/presets'
import type {
  EncodableMimeName,
  Generation,
  ImageSettings,
  MediaKind,
  MediaProbe,
  QueueItem,
  UserFacingError,
  VideoSettings,
} from '@/types/media'

/** Images run two at a time; video runs one at a time because the wasm module is a singleton. */
const IMAGE_CONCURRENCY = 2
const VIDEO_CONCURRENCY = 1

export const defaultImageSettings: ImageSettings = {
  format: 'keep',
  quality: 0.78,
  maxDimensionPx: null,
  keepTransparency: true,
  flattenBackground: '#ffffff',
}

export interface Lineage {
  id: string
  kind: MediaKind
  originalName: string
  rows: GenerationRow[]
  /** Latest finished row of this lineage — what Compress Again feeds forward. */
  latestCompletedItemId: string | null
  passes: number
  advisory: 'diminishing' | null
}

export interface CompressorApi {
  items: QueueItem[]
  summary: QueueSummary
  lineages: Lineage[]
  engine: EngineStatus
  encodable: readonly EncodableMimeName[]
  imageSettings: ImageSettings
  videoSettings: VideoSettings
  zipProgress: number | null
  notice: { tone: 'warn' | 'error'; text: string } | null
  dismissNotice: () => void
  updateImageSettings: (patch: Partial<ImageSettings>) => void
  updateVideoSettings: (patch: Partial<VideoSettings>) => void
  addFiles: (files: readonly File[]) => void
  start: (ids?: readonly string[]) => void
  cancel: (id: string) => void
  cancelAll: () => void
  retry: (id: string) => void
  remove: (id: string) => void
  clearCompleted: () => void
  clearAll: () => void
  compressAgain: (id: string) => void
  downloadItem: (id: string) => Promise<void>
  downloadZip: () => Promise<void>
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function kindOf(file: File): MediaKind | null {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  // Some sources hand over application/octet-stream with a usable extension.
  if (/\.(mp4|m4v|mov|webm|ogv|mkv|avi)$/i.test(file.name)) return 'video'
  if (/\.(jpe?g|png|webp|avif|gif|bmp|heic)$/i.test(file.name)) return 'image'
  return null
}

/** Probe and engine failures already carry a user-facing shape. */
function toUserFacing(error: unknown): UserFacingError {
  return error && typeof error === 'object' && 'code' in error
    ? (error as UserFacingError)
    : classifyError(error)
}

/** Dispatches at most ~10 progress updates per second per row. */
function throttledProgress(dispatch: (ratio: number, label: string) => void) {
  let lastRatio = -1
  return (ratio: number, label: string) => {
    if (ratio - lastRatio < 0.01 && ratio < 1) return
    lastRatio = ratio
    dispatch(ratio, label)
  }
}

export function useCompressor(): CompressorApi {
  const [state, dispatch] = useReducer(queueReducer, initialQueueState)
  const [imageSettings, setImageSettings] = useState<ImageSettings>(defaultImageSettings)
  const [videoSettings, setVideoSettings] = useState<VideoSettings>(defaultVideoSettings)
  const [engine, setEngine] = useState<EngineStatus>(getEngineStatus())
  const [encodable, setEncodable] = useState<readonly EncodableMimeName[]>(['image/jpeg', 'image/png'])
  const [zipProgress, setZipProgress] = useState<number | null>(null)
  const [notice, setNotice] = useState<{ tone: 'warn' | 'error'; text: string } | null>(null)

  const aborts = useRef(new Map<string, AbortController>())
  const imagePool = useRef(new Pool(IMAGE_CONCURRENCY))
  const videoPool = useRef(new Pool(VIDEO_CONCURRENCY))

  // Tasks read settings at run time, so a change made while the queue is draining
  // applies to the rows that have not started yet.
  const imageSettingsRef = useRef(imageSettings)
  const videoSettingsRef = useRef(videoSettings)
  const encodableRef = useRef(encodable)
  imageSettingsRef.current = imageSettings
  videoSettingsRef.current = videoSettings
  encodableRef.current = encodable

  useEffect(() => onEngineStatus(setEngine), [])

  useEffect(() => {
    let cancelled = false
    void detectEncodableMimes().then((supported) => {
      if (!cancelled) setEncodable([...supported] as EncodableMimeName[])
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const controllers = aborts.current
    return () => {
      for (const controller of controllers.values()) controller.abort()
      controllers.clear()
    }
  }, [])

  const runImage = useCallback((item: QueueItem) => {
    imagePool.current.add(async () => {
      const controller = new AbortController()
      aborts.current.set(item.id, controller)
      dispatch({ type: 'start', id: item.id, now: Date.now() })
      dispatch({ type: 'progress', id: item.id, ratio: 0.05, label: 'Decoding' })

      try {
        const outcome = await runImageJob({
          file: item.source,
          settings: imageSettingsRef.current,
          hasAlpha: item.probe?.hasAlpha ?? false,
          encodable: encodableRef.current,
          generation: item.generation,
          signal: controller.signal,
        })
        if (controller.signal.aborted) {
          dispatch({ type: 'cancel', id: item.id })
          return
        }
        dispatch({ type: 'complete', id: item.id, result: outcome.result, now: Date.now() })

        if (outcome.flattened) {
          setNotice({
            tone: 'warn',
            text: `${item.source.name}: transparent pixels were flattened onto ${imageSettingsRef.current.flattenBackground} because JPEG has no alpha channel.`,
          })
        } else if (outcome.formatSubstituted) {
          setNotice({
            tone: 'warn',
            text: `${item.source.name}: this browser cannot encode the requested format, so ${outcome.result.mimeType} was written instead.`,
          })
        }
      } catch (error) {
        if (controller.signal.aborted) dispatch({ type: 'cancel', id: item.id })
        else dispatch({ type: 'fail', id: item.id, error: classifyError(error), now: Date.now() })
      } finally {
        aborts.current.delete(item.id)
      }
    })
  }, [])

  const runVideo = useCallback((item: QueueItem, probe: MediaProbe) => {
    videoPool.current.add(async () => {
      const controller = new AbortController()
      aborts.current.set(item.id, controller)
      dispatch({ type: 'start', id: item.id, now: Date.now() })
      dispatch({ type: 'progress', id: item.id, ratio: 0.01, label: 'Starting the encoder' })

      const report = throttledProgress((ratio, label) =>
        dispatch({ type: 'progress', id: item.id, ratio, label }),
      )

      try {
        const result = await compressVideo({
          file: item.source,
          settings: videoSettingsRef.current,
          probe,
          signal: controller.signal,
          onProgress: (ratio, encodedSeconds) => {
            const totalSeconds = probe.durationMs ? probe.durationMs / 1000 : null
            const label = totalSeconds
              ? `Encoded ${Math.min(encodedSeconds, totalSeconds).toFixed(1)}s of ${totalSeconds.toFixed(1)}s`
              : `Encoded ${encodedSeconds.toFixed(1)}s`
            report(Math.min(0.99, Math.max(0.02, ratio)), label)
          },
        })
        if (controller.signal.aborted) {
          dispatch({ type: 'cancel', id: item.id })
          return
        }
        dispatch({ type: 'progress', id: item.id, ratio: 1, label: 'Writing the file' })
        dispatch({ type: 'complete', id: item.id, result, now: Date.now() })
      } catch (error) {
        if (controller.signal.aborted) dispatch({ type: 'cancel', id: item.id })
        else dispatch({ type: 'fail', id: item.id, error: classifyError(error), now: Date.now() })
      } finally {
        aborts.current.delete(item.id)
      }
    })
  }, [])

  /** Reads metadata for display only. Uploads stay idle until Compress is pressed. */
  const probeOnly = useCallback(async (item: QueueItem) => {
    try {
      if (item.kind === 'image') {
        const { probe, hasAlpha } = await probeImage(item.source)
        dispatch({ type: 'probe', id: item.id, probe: toProbeWithAlpha(probe, hasAlpha) })
        return
      }
      const { probe } = await probeVideo(item.source)
      dispatch({ type: 'probe', id: item.id, probe })
    } catch (error) {
      dispatch({ type: 'probeFailed', id: item.id, error: toUserFacing(error) })
    }
  }, [])

  /**
   * Probes, then hands the row to the matching pool. Never throws. A row probed at
   * upload time reuses that result instead of decoding the same file twice.
   */
  const beginRow = useCallback(
    async (item: QueueItem) => {
      try {
        if (item.probe) {
          if (item.kind === 'image') runImage(item)
          else runVideo(item, item.probe)
          return
        }
        if (item.kind === 'image') {
          const { probe, hasAlpha } = await probeImage(item.source)
          const full = toProbeWithAlpha(probe, hasAlpha)
          dispatch({ type: 'probe', id: item.id, probe: full })
          runImage({ ...item, probe: full })
          return
        }
        const { probe } = await probeVideo(item.source)
        dispatch({ type: 'probe', id: item.id, probe })
        runVideo(item, probe)
      } catch (error) {
        dispatch({ type: 'probeFailed', id: item.id, error: toUserFacing(error) })
      }
    },
    [runImage, runVideo],
  )

  const startRows = useCallback(
    (rows: readonly QueueItem[]) => {
      if (rows.length === 0) return
      dispatch({ type: 'enqueue', ids: rows.map((row) => row.id), now: Date.now() })
      if (rows.some((row) => row.kind === 'video')) void loadEngine().catch(() => undefined)
      for (const row of rows) void beginRow(row)
    },
    [beginRow],
  )

  const addFiles = useCallback(
    (files: readonly File[]) => {
      const now = Date.now()
      const rejected: QueueItem[] = []
      const accepted: QueueItem[] = []

      for (const file of files) {
        const kind = kindOf(file)
        const rejection = kind ? classifyUpload(file, kind) : null
        const row: QueueItem = {
          id: newId(),
          lineageId: newId(),
          generation: 0,
          source: file,
          kind: kind ?? 'image',
          status: rejection || !kind ? 'failed' : 'idle',
          progress: 0,
          progressLabel: rejection || !kind ? 'Rejected' : 'Ready',
          addedAt: now,
          error:
            rejection ??
            (!kind
              ? makeError(
                  'unsupported-media',
                  'Not an image or video',
                  `${file.name} is reported as "${file.type || 'unknown type'}".`,
                )
              : undefined),
        }
        if (row.status === 'failed') rejected.push(row)
        else accepted.push(row)
      }

      const all = [...rejected, ...accepted]
      if (all.length === 0) return
      dispatch({
        type: 'add',
        items: all.map((row) => ({
          id: row.id,
          lineageId: row.lineageId,
          generation: row.generation,
          source: row.source,
          kind: row.kind,
          status: row.status,
          progressLabel: row.progressLabel,
          ...(row.error === undefined ? {} : { error: row.error }),
        })),
        now,
      })
      // Rejections are terminal rows that explain themselves; the rest are probed
      // so their metadata is visible immediately, then wait for Compress.
      for (const row of accepted) void probeOnly(row)
    },
    [probeOnly],
  )

  const start = useCallback(
    (ids?: readonly string[]) => {
      const wanted = ids ? new Set(ids) : null
      const runnable = state.items.filter((item) => isRunnable(item) && (wanted ? wanted.has(item.id) : true))
      startRows(runnable)
    },
    [startRows, state.items],
  )

  const cancel = useCallback((id: string) => {
    aborts.current.get(id)?.abort()
    aborts.current.delete(id)
    dispatch({ type: 'cancel', id })
  }, [])

  /** Stops in-flight work but keeps the rows, so finished results survive. */
  const cancelAll = useCallback(() => {
    for (const controller of aborts.current.values()) controller.abort()
    aborts.current.clear()
    imagePool.current.clearWaiting()
    videoPool.current.clearWaiting()
    terminateEngine()
    for (const item of state.items) {
      if (item.status === 'queued' || item.status === 'processing') {
        dispatch({ type: 'cancel', id: item.id })
      }
    }
  }, [state.items])

  /** Aborts everything, then drops every row. */
  const clearAll = useCallback(() => {
    for (const controller of aborts.current.values()) controller.abort()
    aborts.current.clear()
    imagePool.current.clearWaiting()
    videoPool.current.clearWaiting()
    terminateEngine()
    dispatch({ type: 'clearAll' })
  }, [])

  const remove = useCallback((id: string) => {
    aborts.current.get(id)?.abort()
    aborts.current.delete(id)
    dispatch({ type: 'remove', id })
  }, [])

  const retry = useCallback(
    (id: string) => {
      const row = state.items.find((candidate) => candidate.id === id)
      if (row) startRows([row])
    },
    [startRows, state.items],
  )

  const compressAgain = useCallback(
    (id: string) => {
      const item = state.items.find((candidate) => candidate.id === id)
      const result = item?.result
      if (!item || !result) return

      const generation = item.generation + 1
      const named = new File([result.file], outputNameForGeneration(item.source.name, generation, result.mimeType), {
        type: result.mimeType,
        lastModified: Date.now(),
      })
      const nextId = newId()
      const now = Date.now()

      dispatch({
        type: 'add',
        items: [{ id: nextId, lineageId: item.lineageId, generation, source: named, kind: item.kind }],
        now,
      })
      setNotice({
        tone: 'warn',
        text: 'Re-compressing an already compressed file can reduce quality further. Later passes usually save much less than the first one.',
      })
      startRows([
        {
          id: nextId,
          lineageId: item.lineageId,
          generation,
          source: named,
          kind: item.kind,
          status: 'queued',
          progress: 0,
          progressLabel: 'Queued',
          addedAt: now,
        },
      ])
    },
    [startRows, state.items],
  )

  const downloadItem = useCallback(
    async (id: string) => {
      const item = state.items.find((candidate) => candidate.id === id)
      const result = item?.result
      if (!item || !result) return
      const error = await downloadOrExplain(result.file, result.file.name)
      if (error) setNotice({ tone: 'error', text: `${error.title} — ${error.detail}` })
    },
    [state.items],
  )

  const downloadZip = useCallback(async () => {
    const finished = state.items.filter((item) => item.status === 'completed' && item.result !== undefined)
    if (finished.length === 0) return
    setZipProgress(0)
    try {
      const entries = finished.flatMap((item) =>
        item.result ? [{ name: item.result.file.name, blob: item.result.file }] : [],
      )
      const { blob } = await createZip(entries, setZipProgress)
      await downloadOrExplain(blob, zipFileName(entries.length))
    } catch (error) {
      const typed = asZipError(error)
      setNotice({ tone: 'error', text: `${typed.title} — ${typed.detail}` })
    } finally {
      setZipProgress(null)
    }
  }, [state.items])

  const lineages = useMemo<Lineage[]>(() => {
    const groups = new Map<string, QueueItem[]>()
    for (const item of state.items) {
      const bucket = groups.get(item.lineageId)
      if (bucket) bucket.push(item)
      else groups.set(item.lineageId, [item])
    }

    const built: Lineage[] = []
    for (const [lineageId, group] of groups) {
      const sorted = [...group].sort((a, b) => a.generation - b.generation)
      const root = sorted[0]
      if (!root?.probe) continue

      const generations: Generation[] = [
        {
          index: 0,
          name: root.source.name,
          sizeBytes: root.probe.sizeBytes,
          dimensions: root.probe.dimensions,
          codecLabel: root.kind === 'video' ? 'source file' : root.probe.mimeType || 'source image',
          mimeType: root.probe.mimeType,
          createdAt: root.addedAt,
        },
      ]

      let latestCompletedItemId: string | null = null
      for (const item of sorted) {
        if (item.status !== 'completed' || !item.result) continue
        latestCompletedItemId = item.id
        generations.push({
          index: item.generation,
          name: item.result.file.name,
          sizeBytes: item.result.sizeBytes,
          dimensions: item.result.dimensions,
          codecLabel: item.result.codecLabel,
          mimeType: item.result.mimeType,
          createdAt: item.finishedAt ?? item.addedAt,
        })
      }
      if (generations.length < 2) continue

      const rows = buildChain(generations)
      built.push({
        id: lineageId,
        kind: root.kind,
        originalName: root.source.name,
        rows,
        latestCompletedItemId,
        passes: generations.length - 1,
        advisory: diminishingReturns(rows) ? 'diminishing' : null,
      })
    }
    return built.sort((a, b) => b.passes - a.passes)
  }, [state.items])

  return {
    items: state.items,
    summary: summarise(state.items),
    lineages,
    engine,
    encodable,
    imageSettings,
    videoSettings,
    zipProgress,
    notice,
    dismissNotice: () => setNotice(null),
    updateImageSettings: (patch) => setImageSettings((current) => ({ ...current, ...patch })),
    updateVideoSettings: (patch) => setVideoSettings((current) => ({ ...current, ...patch })),
    addFiles,
    start,
    cancel,
    cancelAll,
    retry,
    remove,
    clearCompleted: () => dispatch({ type: 'clearCompleted' }),
    clearAll,
    compressAgain,
    downloadItem,
    downloadZip,
  }
}

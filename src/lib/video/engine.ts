import { FFmpeg } from '@ffmpeg/ffmpeg'
import { buildVideoArgs, outputExtension } from './args'
import { makeError } from '@/utils/errors'
import { classifyError } from '@/utils/errors'
import type { CompressionResult, MediaProbe, UserFacingError, VideoSettings } from '@/types/media'

/**
 * ffmpeg-core build vendored into public/vendor/ffmpeg by
 * scripts/copy-ffmpeg-assets.mjs. Verified by src/lib/video/args.integration.test.ts
 * against the real wasm module: libx264, libvpx (VP8), aac and libopus encode
 * correctly. libvpx-vp9 is compiled in but aborts with "memory access out of
 * bounds" on every invocation, and AV1 is absent — neither is offered.
 */
const VENDOR_DIR = `${import.meta.env.BASE_URL}vendor/ffmpeg`.replace(/\/{2,}$/, '')
const CORE_URL = `${VENDOR_DIR}/ffmpeg-core.js`
const WASM_URL = `${VENDOR_DIR}/ffmpeg-core.wasm`

export const ENGINE_VERSION = '0.12.10'

export type EngineState = 'unloaded' | 'loading' | 'ready' | 'failed'

export interface EngineStatus {
  state: EngineState
  /** Milliseconds the wasm took to initialise, once known. */
  loadMs?: number
  error?: UserFacingError
}

export interface CompressVideoInput {
  file: File
  settings: VideoSettings
  probe: MediaProbe
  /** 0–1, throttled by the caller's UI. */
  onProgress: (ratio: number, encodedSeconds: number) => void
  signal: AbortSignal
}

interface TempPaths {
  input: string
  output: string
}

let instance: FFmpeg | null = null
let loadPromise: Promise<FFmpeg> | null = null
let status: EngineStatus = { state: 'unloaded' }
const listeners = new Set<(status: EngineStatus) => void>()

function emit(next: EngineStatus): void {
  status = next
  for (const listener of listeners) listener(next)
}

export function getEngineStatus(): EngineStatus {
  return status
}

export function onEngineStatus(listener: (status: EngineStatus) => void): () => void {
  listeners.add(listener)
  listener(status)
  return () => listeners.delete(listener)
}

/** Lazily spins up the worker + wasm module. Concurrent callers share one promise. */
export function loadEngine(): Promise<FFmpeg> {
  if (instance?.loaded) return Promise.resolve(instance)
  if (loadPromise) return loadPromise

  if (typeof Worker === 'undefined') {
    const error = makeError(
      'engine-load-failed',
      'Web Workers are unavailable',
      'Video compression needs Web Workers. Private-browsing modes that block them cannot run this tool.',
    )
    emit({ state: 'failed', error })
    return Promise.reject(error)
  }

  emit({ state: 'loading' })
  const startedAt = performance.now()

  loadPromise = (async () => {
    const ffmpeg = new FFmpeg()
    await ffmpeg.load({ coreURL: CORE_URL, wasmURL: WASM_URL })
    instance = ffmpeg
    emit({ state: 'ready', loadMs: performance.now() - startedAt })
    return ffmpeg
  })().catch((cause: unknown) => {
    instance = null
    loadPromise = null
    const error =
      cause && typeof cause === 'object' && 'code' in cause
        ? (cause as UserFacingError)
        : makeError(
            'engine-load-failed',
            'The video engine did not start',
            'The 32 MB ffmpeg-core module could not be fetched or compiled. Check the network, then retry.',
            cause instanceof Error ? cause.message : String(cause),
          )
    emit({ state: 'failed', error })
    throw error
  })

  return loadPromise
}

/**
 * Cancelling means terminating the worker: WebAssembly has no cooperative stop,
 * so the only honest cancel is to throw the module away. The next job reloads it.
 */
export function terminateEngine(): void {
  instance?.terminate()
  instance = null
  loadPromise = null
  emit({ state: 'unloaded' })
}

function extensionOf(name: string, fallback: string): string {
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return fallback
  return name.slice(dot + 1).toLowerCase()
}

function tempPathsFor(file: File, container: VideoSettings['container'], jobId: string): TempPaths {
  const inputExt = extensionOf(file.name, container === 'webm' ? 'webm' : 'mp4')
  const safeExt = /^[a-z0-9]{1,5}$/.test(inputExt) ? inputExt : 'bin'
  return {
    input: `in-${jobId}.${safeExt}`,
    output: `out-${jobId}.${outputExtension(container)}`,
  }
}

/**
 * Full pipeline: write the source into the wasm filesystem, encode, read the
 * output back, delete both temp files. A failure at any step still runs the
 * cleanup, so one bad clip cannot leave 200 MB pinned in wasm memory.
 */
export async function compressVideo({
  file,
  settings,
  probe,
  onProgress,
  signal,
}: CompressVideoInput): Promise<CompressionResult> {
  const jobId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const ffmpeg = await loadEngine()
  if (!instance) throw makeError('engine-load-failed', 'The video engine is not running', 'Retry — it will restart.')

  const { input, output } = tempPathsFor(file, settings.container, jobId)
  const startedAt = performance.now()

  const onAbort = () => {
    // Terminating rejects every pending promise with ERROR_TERMINATED.
    terminateEngine()
  }
  if (signal.aborted) onAbort()
  else signal.addEventListener('abort', onAbort, { once: true })

  const handleProgress = ({ progress, time }: { progress: number; time: number }) => {
    const ratio = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0
    onProgress(ratio, Number.isFinite(time) ? time : 0)
  }
  ffmpeg.on('progress', handleProgress)

  try {
    await ffmpeg.writeFile(input, new Uint8Array(await file.arrayBuffer()))

    const args = buildVideoArgs({
      inputPath: input,
      outputPath: output,
      settings,
      source: probe.dimensions,
    })

    const exitCode = await ffmpeg.exec(args)
    if (signal.aborted) throw new DOMException('Compression cancelled', 'AbortError')
    if (exitCode !== 0) {
      throw makeError(
        'codec-failed',
        'The encoder stopped early',
        'Try a different output format or a lower resolution, then retry.',
        `ffmpeg exited with code ${exitCode}`,
      )
    }

    const data = (await ffmpeg.readFile(output)) as Uint8Array | string
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data)
    if (bytes.byteLength === 0) {
      throw makeError('codec-failed', 'The encoder produced an empty file', 'Try a lower resolution or another format.')
    }

    const mimeType = settings.container === 'webm' ? 'video/webm' : 'video/mp4'
    const outputName = `${baseName(file.name)}.${outputExtension(settings.container)}`
    const outputFile = new File([bytes as unknown as BlobPart], outputName, { type: mimeType })

    return {
      file: outputFile,
      sizeBytes: outputFile.size,
      mimeType,
      dimensions: outputDimensions(probe, settings),
      ...(probe.durationMs === undefined ? {} : { durationMs: probe.durationMs }),
      codecLabel: codecLabel(settings),
      elapsedMs: performance.now() - startedAt,
    }
  } finally {
    ffmpeg.off('progress', handleProgress)
    signal.removeEventListener('abort', onAbort)
    // The worker may already be gone after a cancel — swallow, the module is discarded anyway.
    await Promise.allSettled([safeDelete(ffmpeg, input), safeDelete(ffmpeg, output)])
  }
}

async function safeDelete(ffmpeg: FFmpeg, path: string): Promise<void> {
  try {
    await ffmpeg.deleteFile(path)
  } catch {
    /* worker terminated mid-delete; the whole filesystem goes with it */
  }
}

function baseName(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(0, dot) : name
}

function outputDimensions(probe: MediaProbe, settings: VideoSettings): CompressionResult['dimensions'] {
  if (settings.resolution === 'source') return probe.dimensions
  const targetHeight = Number(settings.resolution)
  if (!Number.isFinite(targetHeight) || probe.dimensions.height <= targetHeight) return probe.dimensions
  const ratio = targetHeight / probe.dimensions.height
  const even = (value: number) => Math.max(2, Math.floor(value / 2) * 2)
  return { width: even(probe.dimensions.width * ratio), height: even(targetHeight) }
}

export function codecLabel(settings: VideoSettings): string {
  const video = settings.videoCodec === 'libvpx' ? 'VP8' : 'H.264'
  const container = settings.container === 'webm' ? 'WebM' : 'MP4'
  const audio =
    settings.audioCodec === null ? 'no audio' : settings.audioCodec === 'libopus' ? 'Opus' : 'AAC'
  return `${video} · ${container} · ${audio}`
}

/** Convenience for the UI: one call that maps a raw throw to a user-facing error. */
export function toUserError(cause: unknown): UserFacingError {
  return classifyError(cause)
}

/** Domain types for the compression workflow. No `any` anywhere in this file. */

export type MediaKind = 'image' | 'video'

/** Every state a queue row can be in. `idle` is the state before the first run. */
export type QueueStatus =
  | 'idle'
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface Dimensions {
  width: number
  height: number
}

export type ErrorCode =
  | 'unsupported-media'
  | 'empty-file'
  | 'too-large'
  | 'engine-load-failed'
  | 'codec-failed'
  | 'out-of-memory'
  | 'cancelled'
  | 'removed-during-processing'
  | 'queue-cleared'
  | 'zip-failed'
  | 'download-failed'
  | 'decode-failed'
  | 'no-space-gained'
  | 'unknown'

export interface UserFacingError {
  code: ErrorCode
  /** Short sentence shown in the queue row. */
  title: string
  /** What the user can actually do next. */
  detail: string
  /** Kept out of the UI unless `import.meta.env.DEV`. */
  diagnostic?: string
}

export interface MediaProbe {
  kind: MediaKind
  name: string
  sizeBytes: number
  mimeType: string
  dimensions: Dimensions
  /** Videos only. */
  durationMs?: number
  /** Videos only, best effort — a silent track still reports a track. */
  hasAudio?: boolean
  /** Images only: the source has pixels with alpha < 255. */
  hasAlpha?: boolean
  /** Videos only: a data URL poster frame. Data URLs need no revocation. */
  thumbnailUrl?: string
}

/** One completed output, ready for download or for a further pass. */
export interface CompressionResult {
  file: File
  sizeBytes: number
  mimeType: string
  dimensions: Dimensions
  /** Videos only. */
  durationMs?: number
  /** Human readable codec/container, e.g. "H.264 · MP4". */
  codecLabel: string
  elapsedMs: number
}

export type ImageOutputFormat = 'keep' | 'jpeg' | 'webp' | 'avif' | 'png'

export interface ImageSettings {
  format: ImageOutputFormat
  /** 0–1. Ignored for lossless PNG output. */
  quality: number
  /** Longest edge in px, or null to keep the source dimensions. */
  maxDimensionPx: number | null
  /** When false, transparent sources may be flattened onto `flattenBackground`. */
  keepTransparency: boolean
  flattenBackground: string
}

export type VideoPresetId = 'fast' | 'balanced' | 'small' | 'custom'

/**
 * Codecs this ffmpeg-core build actually encodes with. libvpx-vp9 is compiled into
 * the binary but aborts with "memory access out of bounds" on every invocation, so
 * the WebM path uses VP8 (libvpx), which is verified working. See
 * src/lib/video/args.integration.test.ts.
 */
export type VideoCodec = 'libx264' | 'libvpx'
export type AudioCodec = 'aac' | 'libopus'
export type VideoContainer = 'mp4' | 'webm'
export type X264Preset = 'ultrafast' | 'veryfast' | 'faster' | 'medium' | 'slow' | 'veryslow'
export type ResolutionId = 'source' | '2160' | '1440' | '1080' | '720' | '480' | '360'

export interface VideoSettings {
  presetId: VideoPresetId
  container: VideoContainer
  videoCodec: VideoCodec
  /** `null` keeps the original audio track; there is no codec choice then. */
  audioCodec: AudioCodec | null
  /** Constant rate factor. Lower is better; range depends on the codec. */
  crf: number
  resolution: ResolutionId
  /** `null` keeps the source frame rate. */
  fps: number | null
  /** Kbps, or null to drop audio. */
  audioBitrateKbps: number | null
  x264Preset: X264Preset
  /** Two-pass is not offered: WebAssembly memory makes it a poor trade. */
  fastStart: boolean
}

export interface QueueItem {
  id: string
  /** Group key shared by every pass of the same original file. */
  lineageId: string
  /** 0 for the original upload, +1 per re-compression. */
  generation: number
  source: File
  kind: MediaKind
  status: QueueStatus
  progress: number
  progressLabel: string
  probe?: MediaProbe
  probeError?: UserFacingError
  result?: CompressionResult
  error?: UserFacingError
  addedAt: number
  startedAt?: number
  finishedAt?: number
}

/** A row in the generation chain shown under a finished item. */
export interface Generation {
  index: number
  name: string
  sizeBytes: number
  dimensions: Dimensions
  codecLabel: string
  mimeType: string
  createdAt: number
}

export type EncodableMimeName = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif'

export interface ImageWorkerRequest {
  id: string
  /** Transferred to the worker, never copied. */
  bitmap: ImageBitmap
  sourceSizeBytes: number
  sourceMime: string
  sourceName: string
  hasAlpha: boolean
  /** Detected on the main thread; the worker cannot feature-detect reliably. */
  encodable: readonly EncodableMimeName[]
  settings: ImageSettings
}

export type ImageWorkerResponse =
  | {
      id: string
      ok: true
      blob: Blob
      mimeType: string
      dimensions: Dimensions
      elapsedMs: number
      flattened: boolean
      formatSubstituted: boolean
    }
  | { id: string; ok: false; message: string }

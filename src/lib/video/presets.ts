import type { VideoPresetId, VideoSettings } from '@/types/media'

export interface CrfRange {
  min: number
  max: number
  /** Reasonable default for general footage. */
  recommended: number
}

/**
 * CRF scales are codec specific: libx264 runs 0–51 and libvpx 4–63, and the same
 * number means different quality in each. The bounds below are the useful slice. The UI clamps to these bounds
 * so a preset switch cannot leave an out-of-range value behind.
 */
export const CRF_RANGE: Record<'libx264' | 'libvpx', CrfRange> = {
  libx264: { min: 16, max: 40, recommended: 24 },
  libvpx: { min: 10, max: 50, recommended: 32 },
}

export interface PresetDefinition {
  id: VideoPresetId
  label: string
  /** What the preset actually changes, in one line. */
  description: string
  settings: VideoSettings
}

export const PRESETS: readonly PresetDefinition[] = [
  {
    id: 'fast',
    label: 'Fast',
    description: 'CRF 28, veryfast x264, source resolution, 96 kbps audio',
    settings: {
      presetId: 'fast',
      container: 'mp4',
      videoCodec: 'libx264',
      audioCodec: 'aac',
      crf: 28,
      resolution: 'source',
      fps: null,
      audioBitrateKbps: 96,
      x264Preset: 'veryfast',
      fastStart: true,
    },
  },
  {
    id: 'balanced',
    label: 'Balanced',
    description: 'CRF 24, faster x264, capped at 1080p, 128 kbps audio',
    settings: {
      presetId: 'balanced',
      container: 'mp4',
      videoCodec: 'libx264',
      audioCodec: 'aac',
      crf: 24,
      resolution: '1080',
      fps: null,
      audioBitrateKbps: 128,
      x264Preset: 'faster',
      fastStart: true,
    },
  },
  {
    id: 'small',
    label: 'Small File',
    description: 'CRF 31, medium x264, capped at 720p, 30 fps, 64 kbps audio',
    settings: {
      presetId: 'small',
      container: 'mp4',
      videoCodec: 'libx264',
      audioCodec: 'aac',
      crf: 31,
      resolution: '720',
      fps: 30,
      audioBitrateKbps: 64,
      x264Preset: 'medium',
      fastStart: true,
    },
  },
  {
    id: 'custom',
    label: 'Custom',
    description: 'Every control below is editable',
    settings: {
      presetId: 'custom',
      container: 'mp4',
      videoCodec: 'libx264',
      audioCodec: 'aac',
      crf: 24,
      resolution: 'source',
      fps: null,
      audioBitrateKbps: 128,
      x264Preset: 'faster',
      fastStart: true,
    },
  },
]

/** Used when an unknown preset id arrives from persisted or malformed input. */
const FALLBACK_PRESET: PresetDefinition = {
  id: 'fast',
  label: 'Fast',
  description: 'CRF 28, veryfast x264, source resolution, 96 kbps audio',
  settings: {
    presetId: 'fast',
    container: 'mp4',
    videoCodec: 'libx264',
    audioCodec: 'aac',
    crf: 28,
    resolution: 'source',
    fps: null,
    audioBitrateKbps: 96,
    x264Preset: 'veryfast',
    fastStart: true,
  },
}

export function presetById(id: VideoPresetId): PresetDefinition {
  return PRESETS.find((preset) => preset.id === id) ?? FALLBACK_PRESET
}

export function defaultVideoSettings(): VideoSettings {
  return { ...presetById('balanced').settings }
}

/** Container and codec are coupled: WebM carries VP8 here, MP4 carries H.264. */
export function codecsForContainer(container: 'mp4' | 'webm'): {
  video: 'libx264' | 'libvpx'
  audio: 'aac' | 'libopus'
} {
  return container === 'webm' ? { video: 'libvpx', audio: 'libopus' } : { video: 'libx264', audio: 'aac' }
}

export function clampCrf(codec: 'libx264' | 'libvpx', crf: number): number {
  const range = CRF_RANGE[codec]
  if (!Number.isFinite(crf)) return range.recommended
  return Math.min(range.max, Math.max(range.min, Math.round(crf)))
}

export function qualityAdjective(codec: 'libx264' | 'libvpx', crf: number): string {
  const range = CRF_RANGE[codec]
  const span = range.max - range.min
  const position = (crf - range.min) / span
  if (position <= 0.2) return 'near-lossless'
  if (position <= 0.4) return 'high'
  if (position <= 0.6) return 'balanced'
  if (position <= 0.8) return 'reduced'
  return 'aggressive'
}

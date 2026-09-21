import type { Dimensions, VideoContainer, VideoSettings } from '@/types/media'

export interface BuildArgsInput {
  inputPath: string
  outputPath: string
  settings: VideoSettings
  source: Dimensions
}

export function outputExtension(container: VideoContainer): string {
  return container === 'webm' ? 'webm' : 'mp4'
}

/**
 * `scale=-2:720` keeps the aspect ratio and forces an even width. Returns null
 * when scaling would enlarge the frame — upscaling adds bytes and no detail.
 */
export function buildScaleFilter(source: Dimensions, resolution: VideoSettings['resolution']): string | null {
  if (resolution === 'source') return null
  const targetHeight = Number(resolution)
  if (!Number.isFinite(targetHeight) || targetHeight <= 0) return null
  if (source.height > 0 && source.height <= targetHeight) return null
  return `scale=-2:${targetHeight}`
}

export function buildVideoArgs({ inputPath, outputPath, settings, source }: BuildArgsInput): string[] {
  const args: string[] = ['-hide_banner', '-i', inputPath]

  if (settings.videoCodec === 'libvpx') {
    // -b:v 0 puts libvpx in CRF mode. -cpu-used 4 trades a little efficiency for
    // an encode that finishes in a browser tab instead of minutes per second.
    args.push('-c:v', 'libvpx', '-crf', String(settings.crf), '-b:v', '0', '-cpu-used', '4')
  } else {
    args.push('-c:v', 'libx264', '-preset', settings.x264Preset, '-crf', String(settings.crf))
  }

  // Without an explicit pixel format x264 can emit yuv444p, which Safari refuses.
  args.push('-pix_fmt', 'yuv420p')

  const scale = buildScaleFilter(source, settings.resolution)
  if (scale) args.push('-vf', scale)

  if (settings.fps !== null && settings.fps > 0) {
    args.push('-r', String(settings.fps))
  }

  if (settings.audioCodec === null || settings.audioBitrateKbps === null || settings.audioBitrateKbps <= 0) {
    args.push('-an')
  } else {
    args.push('-c:a', settings.audioCodec, '-b:a', `${Math.round(settings.audioBitrateKbps)}k`)
  }

  if (settings.container === 'mp4' && settings.fastStart) {
    args.push('-movflags', '+faststart')
  }

  args.push(outputPath)
  return args
}

/** Renders the exact command for the "show command" disclosure. */
export function describeCommand(args: readonly string[]): string {
  return ['ffmpeg', ...args].join(' ')
}

/** Container/codec pairs this build can actually mux. */
export function isSupportedCombination(container: VideoContainer, videoCodec: string, audioCodec: string | null): boolean {
  if (container === 'mp4') return videoCodec === 'libx264' && (audioCodec === null || audioCodec === 'aac')
  return videoCodec === 'libvpx' && (audioCodec === null || audioCodec === 'libopus')
}

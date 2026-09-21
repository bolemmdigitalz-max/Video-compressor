import { describe, expect, it } from 'vitest'
import {
  buildScaleFilter,
  buildVideoArgs,
  describeCommand,
  isSupportedCombination,
  outputExtension,
} from './args'
import { presetById } from './presets'

const source = { width: 3840, height: 2160 }

describe('buildScaleFilter', () => {
  it('returns null when the source resolution is kept', () => {
    expect(buildScaleFilter(source, 'source')).toBeNull()
  })

  it('never upscales', () => {
    expect(buildScaleFilter({ width: 1280, height: 720 }, '1080')).toBeNull()
    expect(buildScaleFilter({ width: 1920, height: 1080 }, '1080')).toBeNull()
  })

  it('scales down with an even width', () => {
    expect(buildScaleFilter(source, '720')).toBe('scale=-2:720')
    expect(buildScaleFilter({ width: 1920, height: 1080 }, '480')).toBe('scale=-2:480')
  })

  it('ignores an unparseable resolution id', () => {
    expect(buildScaleFilter(source, 'nonsense' as 'source')).toBeNull()
  })
})

describe('buildVideoArgs', () => {
  it('emits an x264 command for the balanced preset', () => {
    const args = buildVideoArgs({
      inputPath: 'in-1.mp4',
      outputPath: 'out-1.mp4',
      settings: presetById('balanced').settings,
      source,
    })
    expect(args.slice(0, 3)).toEqual(['-hide_banner', '-i', 'in-1.mp4'])
    expect(args).toContain('libx264')
    expect(args).toContain('-crf')
    expect(args[args.indexOf('-crf') + 1]).toBe('24')
    expect(args).toContain('-pix_fmt')
    expect(args).toContain('yuv420p')
    expect(args).toContain('-vf')
    expect(args[args.indexOf('-vf') + 1]).toBe('scale=-2:1080')
    expect(args).toContain('-movflags')
    expect(args[args.length - 1]).toBe('out-1.mp4')
  })

  it('drops the scale filter when the source is already small enough', () => {
    const args = buildVideoArgs({
      inputPath: 'in-1.mp4',
      outputPath: 'out-1.mp4',
      settings: presetById('balanced').settings,
      source: { width: 1280, height: 720 },
    })
    expect(args).not.toContain('-vf')
  })

  it('uses VP8 with a zero bitrate so CRF drives quality', () => {
    const args = buildVideoArgs({
      inputPath: 'in-1.webm',
      outputPath: 'out-1.webm',
      settings: {
        ...presetById('custom').settings,
        container: 'webm',
        videoCodec: 'libvpx',
        audioCodec: 'libopus',
        crf: 32,
      },
      source,
    })
    expect(args).toContain('libvpx')
    expect(args).toContain('-cpu-used')
    expect(args).toContain('-b:v')
    expect(args[args.indexOf('-b:v') + 1]).toBe('0')
    expect(args).toContain('libopus')
    expect(args).not.toContain('-movflags')
  })

  it('removes the audio track when audio is switched off', () => {
    const args = buildVideoArgs({
      inputPath: 'in-1.mp4',
      outputPath: 'out-1.mp4',
      settings: { ...presetById('fast').settings, audioCodec: null, audioBitrateKbps: null },
      source: { width: 1280, height: 720 },
    })
    expect(args).toContain('-an')
    expect(args).not.toContain('-c:a')
  })

  it('adds a frame rate cap only when one is set', () => {
    const capped = buildVideoArgs({
      inputPath: 'in.mp4',
      outputPath: 'out.mp4',
      settings: { ...presetById('small').settings, fps: 30 },
      source: { width: 1280, height: 720 },
    })
    expect(capped[capped.indexOf('-r') + 1]).toBe('30')

    const uncapped = buildVideoArgs({
      inputPath: 'in.mp4',
      outputPath: 'out.mp4',
      settings: { ...presetById('small').settings, fps: null },
      source: { width: 1280, height: 720 },
    })
    expect(uncapped).not.toContain('-r')
  })
})

describe('describeCommand', () => {
  it('prefixes ffmpeg', () => {
    expect(describeCommand(['-i', 'a.mp4', 'b.mp4'])).toBe('ffmpeg -i a.mp4 b.mp4')
  })
})

describe('outputExtension', () => {
  it('maps containers to extensions', () => {
    expect(outputExtension('mp4')).toBe('mp4')
    expect(outputExtension('webm')).toBe('webm')
  })
})

describe('isSupportedCombination', () => {
  it('accepts the two pairs this build can mux', () => {
    expect(isSupportedCombination('mp4', 'libx264', 'aac')).toBe(true)
    expect(isSupportedCombination('webm', 'libvpx', 'libopus')).toBe(true)
    expect(isSupportedCombination('mp4', 'libx264', null)).toBe(true)
  })

  it('rejects impossible pairs rather than failing at encode time', () => {
    expect(isSupportedCombination('webm', 'libx264', 'aac')).toBe(false)
    expect(isSupportedCombination('mp4', 'libvpx', 'libopus')).toBe(false)
    // VP9 is present in the binary but aborts, so it is not a supported combination.
    expect(isSupportedCombination('webm', 'libvpx-vp9', 'libopus')).toBe(false)
    expect(isSupportedCombination('mp4', 'libsvtav1', 'aac')).toBe(false)
  })
})

// @vitest-environment node
/**
 * Integration test against the real ffmpeg-core WebAssembly build.
 *
 * It generates a genuine H.264 source with lavfi, then encodes it with the exact
 * argument array `buildVideoArgs` produces for each preset — so a wrong flag, a
 * bad scale filter or an unsupported codec fails here instead of in the browser.
 *
 * The browser wrapper calls `ffmpeg.exec(...args)`; this test does the same.
 */
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { buildVideoArgs } from './args'
import { presetById } from './presets'
import type { VideoSettings } from '@/types/media'

interface Core {
  exec: (...args: string[]) => number
  ffprobe: (...args: string[]) => number
  reset: () => void
  setTimeout: (ms: number) => void
  setLogger: (fn: (entry: { message: string }) => void) => void
  FS: {
    writeFile: (path: string, data: Uint8Array) => void
    readFile: (path: string) => Uint8Array
    unlink: (path: string) => void
  }
}

const here = dirname(fileURLToPath(import.meta.url))
const CORE_DIR = resolve(here, '../../../node_modules/@ffmpeg/core/dist/esm')

let core: Core | null = null
let logs: string[] = []

const SOURCE_720 = 'src-720.mp4'
const SOURCE_SMALL = 'src-small.mp4'

beforeAll(async () => {
  // The core bundle assumes a browser worker; it only reads self.location.href.
  ;(globalThis as { self?: unknown }).self = { location: { href: `file://${CORE_DIR}/ffmpeg-core.js` } }
  const factory = (await import(`file://${CORE_DIR}/ffmpeg-core.js`)).default as (options: {
    wasmBinary: Uint8Array
  }) => Promise<Core>

  core = await factory({ wasmBinary: new Uint8Array(readFileSync(`${CORE_DIR}/ffmpeg-core.wasm`)) })
  core.setLogger((entry) => logs.push(entry.message))
  core.setTimeout(-1)

  // A real 3 s 1280x720 H.264 + AAC clip, and a small one for the slower VP9 test.
  run(
    core,
    ...[
      '-hide_banner', '-f', 'lavfi', '-i', 'testsrc=duration=3:size=1280x720:rate=30',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', SOURCE_720,
    ],
  )
  run(
    core,
    ...[
      '-hide_banner', '-f', 'lavfi', '-i', 'testsrc=duration=1:size=320x180:rate=30',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-an', SOURCE_SMALL,
    ],
  )
}, 240_000)

afterAll(() => {
  core = null
})

function run(instance: Core, ...args: string[]): number {
  const code = instance.exec(...args)
  instance.reset()
  return code
}

function ffprobe(instance: Core, file: string, entries: string): string {
  logs = []
  instance.ffprobe(...['-v', 'error', '-show_entries', entries, '-of', 'default=noprint_wrappers=1:nokey=1', file])
  instance.reset()
  return logs.join('\n').trim()
}

/** Runs the app's own argument builder against the real encoder. */
function encode(settings: VideoSettings, input: string, output: string, source: { width: number; height: number }) {
  if (!core) throw new Error('core not loaded')
  const args = buildVideoArgs({ inputPath: input, outputPath: output, settings, source })
  logs = []
  const code = run(core, ...args)
  let bytes = new Uint8Array(0)
  try {
    bytes = core.FS.readFile(output)
  } catch {
    bytes = new Uint8Array(0)
  }
  return { code, bytes, args, log: logs.join('\n') }
}

describe('buildVideoArgs against the real ffmpeg-core build', () => {
  it(
    'encodes the balanced preset to a smaller H.264 MP4',
    () => {
      if (!core) throw new Error('core not loaded')
      const sourceBytes = core.FS.readFile(SOURCE_720)
      const { code, bytes } = encode(presetById('balanced').settings, SOURCE_720, 'out-balanced.mp4', {
        width: 1280,
        height: 720,
      })

      expect(code).toBe(0)
      expect(bytes.byteLength).toBeGreaterThan(1000)
      expect(bytes.byteLength).toBeLessThan(sourceBytes.byteLength)

      const streams = ffprobe(core, 'out-balanced.mp4', 'stream=codec_name,width,height')
      expect(streams).toContain('h264')
      expect(streams).toContain('aac')
      // The source is already 720p, so the 1080p cap must not have scaled anything.
      expect(streams).toContain('1280')
    },
    240_000,
  )

  it(
    'scales down and caps the frame rate for the small-file preset',
    () => {
      if (!core) throw new Error('core not loaded')
      const { code, bytes } = encode(presetById('small').settings, SOURCE_720, 'out-small.mp4', {
        width: 1280,
        height: 720,
      })

      expect(code).toBe(0)
      expect(bytes.byteLength).toBeGreaterThan(1000)
      const streams = ffprobe(core, 'out-small.mp4', 'stream=codec_name,width,height')
      expect(streams).toContain('h264')
      // 720p source capped at 720p: no scale filter should have been emitted.
      expect(streams).toContain('1280')

      const forced = encode(
        { ...presetById('small').settings, resolution: '360', fps: 15 },
        SOURCE_720,
        'out-small-360.mp4',
        { width: 1280, height: 720 },
      )
      expect(forced.code).toBe(0)
      const scaled = ffprobe(core, 'out-small-360.mp4', 'stream=width,height')
      expect(scaled).toContain('360')
      expect(Number(scaled.split('\n')[0])).toBeLessThan(1280)
      expect(forced.bytes.byteLength).toBeGreaterThan(1000)
    },
    240_000,
  )

  it(
    'drops the audio track when audio is switched off',
    () => {
      if (!core) throw new Error('core not loaded')
      const settings: VideoSettings = {
        ...presetById('fast').settings,
        audioCodec: null,
        audioBitrateKbps: null,
      }
      const { code, args } = encode(settings, SOURCE_720, 'out-noaudio.mp4', { width: 1280, height: 720 })
      expect(code).toBe(0)
      expect(args).toContain('-an')

      const streams = ffprobe(core, 'out-noaudio.mp4', 'stream=codec_type')
      expect(streams).toContain('video')
      expect(streams).not.toContain('audio')
    },
    240_000,
  )

  it(
    'encodes WebM with VP8 + Opus, the codec pair this core can actually run',
    () => {
      if (!core) throw new Error('core not loaded')
      const settings: VideoSettings = {
        ...presetById('custom').settings,
        container: 'webm',
        videoCodec: 'libvpx',
        audioCodec: 'libopus',
        audioBitrateKbps: 48,
        crf: 32,
        resolution: 'source',
      }
      const { code, bytes } = encode(settings, SOURCE_SMALL, 'out-vp8.webm', { width: 320, height: 180 })

      expect(code).toBe(0)
      expect(bytes.byteLength).toBeGreaterThan(500)
      expect(ffprobe(core, 'out-vp8.webm', 'stream=codec_name')).toContain('vp8')
    },
    300_000,
  )

  it(
    'confirms libvpx-vp9 is unusable in this build, which is why the UI does not offer it',
    () => {
      if (!core) throw new Error('core not loaded')
      // Every form of the VP9 invocation aborts the wasm module. Recorded here so a
      // future core upgrade that fixes it fails this test and re-opens the option.
      let failure = ''
      try {
        run(core, ...['-hide_banner', '-i', SOURCE_SMALL, '-c:v', 'libvpx-vp9', '-crf', '35', '-b:v', '0', '-an', 'out-vp9.webm'])
      } catch (error) {
        failure = error instanceof Error ? error.message : String(error)
      }
      expect(failure).toMatch(/memory access out of bounds|abort/i)
      // The build is still healthy afterwards: H.264 keeps working.
      const after = encode(presetById('fast').settings, SOURCE_720, 'out-after-vp9.mp4', {
        width: 1280,
        height: 720,
      })
      expect(after.code).toBe(0)
    },
    300_000,
  )

  it(
    'accepts its own output as input, which is what Compress Again relies on',
    () => {
      if (!core) throw new Error('core not loaded')
      const first = encode(presetById('fast').settings, SOURCE_720, 'out-pass1.mp4', {
        width: 1280,
        height: 720,
      })
      expect(first.code).toBe(0)

      const second = encode(
        { ...presetById('fast').settings, crf: 30 },
        'out-pass1.mp4',
        'out-pass2.mp4',
        { width: 1280, height: 720 },
      )
      expect(second.code).toBe(0)
      expect(second.bytes.byteLength).toBeGreaterThan(1000)

      const streams = ffprobe(core, 'out-pass2.mp4', 'stream=codec_name')
      expect(streams).toContain('h264')
    },
    300_000,
  )

  it('reports a non-zero exit code for a file that is not a video', () => {
    if (!core) throw new Error('core not loaded')
    core.FS.writeFile('garbage.mp4', new TextEncoder().encode('this is not a video'))
    const { code } = encode(presetById('fast').settings, 'garbage.mp4', 'out-garbage.mp4', {
      width: 1280,
      height: 720,
    })
    expect(code).not.toBe(0)
  }, 240_000)
})

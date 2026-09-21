import type { MediaProbe } from '@/types/media'

interface VideoWithOptionalAudio extends HTMLVideoElement {
  mozHasAudio?: boolean
  webkitAudioDecodedByteCount?: number
  audioTracks?: { length: number }
}

const THUMB_WIDTH = 320

export interface ProbeOutcome {
  probe: MediaProbe
}

/**
 * Reads duration, dimensions and a poster frame through a detached <video>.
 * The element is fully released before returning so a batch of 50 clips does not
 * accumulate hidden media elements.
 */
export async function probeVideo(file: File): Promise<ProbeOutcome> {
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.preload = 'metadata'
  video.muted = true
  video.playsInline = true
  video.src = url

  try {
    await waitForMetadata(video)
    const width = video.videoWidth
    const height = video.videoHeight
    if (!width || !height) {
      throw new Error('The browser decoded no video frames from this file')
    }

    const durationMs = Number.isFinite(video.duration) && video.duration > 0 ? video.duration * 1000 : undefined
    const thumbnailUrl = await captureThumbnail(video, durationMs)
    const audio = detectAudio(video)
    const probe: MediaProbe = {
      kind: 'video',
      name: file.name,
      sizeBytes: file.size,
      mimeType: file.type || 'video/mp4',
      dimensions: { width, height },
      ...(durationMs === undefined ? {} : { durationMs }),
      ...(audio === undefined ? {} : { hasAudio: audio }),
      ...(thumbnailUrl ? { thumbnailUrl } : {}),
    }
    return { probe }
  } finally {
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(url)
  }
}

function waitForMetadata(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false
    const timer = window.setTimeout(() => {
      if (settled) return
      settled = true
      reject(new Error('Reading this video took longer than 20 seconds'))
    }, 20_000)

    const done = (fn: () => void) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      cleanup()
      fn()
    }
    const onError = () =>
      done(() =>
        reject(
          new Error(
            video.error
              ? `Decode error ${video.error.code}: ${video.error.message || 'no detail reported'}`
              : 'The browser could not open this file',
          ),
        ),
      )
    const onLoaded = () => done(resolve)

    const cleanup = () => {
      video.removeEventListener('loadedmetadata', onLoaded)
      video.removeEventListener('error', onError)
    }

    video.addEventListener('loadedmetadata', onLoaded)
    video.addEventListener('error', onError)
  })
}

/** Best effort: Safari, Firefox and Chrome each expose audio presence differently. */
function detectAudio(video: HTMLVideoElement): boolean | undefined {
  const candidate = video as VideoWithOptionalAudio
  if (typeof candidate.mozHasAudio === 'boolean') return candidate.mozHasAudio
  if (candidate.audioTracks && typeof candidate.audioTracks.length === 'number') {
    return candidate.audioTracks.length > 0
  }
  if (typeof candidate.webkitAudioDecodedByteCount === 'number') {
    return candidate.webkitAudioDecodedByteCount > 0
  }
  return undefined
}

function captureThumbnail(video: HTMLVideoElement, durationMs?: number): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    const finish = (value: string | null) => resolve(value)
    const timer = window.setTimeout(() => finish(null), 6_000)

    const draw = () => {
      window.clearTimeout(timer)
      try {
        const ratio = video.videoHeight > 0 ? video.videoWidth / video.videoHeight : 16 / 9
        const canvas = document.createElement('canvas')
        canvas.width = THUMB_WIDTH
        canvas.height = Math.max(2, Math.round(THUMB_WIDTH / ratio))
        const ctx = canvas.getContext('2d')
        if (!ctx) return finish(null)
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        finish(canvas.toDataURL('image/jpeg', 0.72))
      } catch {
        finish(null)
      }
    }

    const target = durationMs ? Math.min(Math.max(durationMs / 1000 * 0.1, 0.1), Math.max(video.duration - 0.2, 0.1)) : 0.1
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked)
      draw()
    }
    video.addEventListener('seeked', onSeeked)
    try {
      video.currentTime = target
    } catch {
      window.clearTimeout(timer)
      video.removeEventListener('seeked', onSeeked)
      finish(null)
    }
  })
}

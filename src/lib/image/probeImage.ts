import { analyseAlpha } from './transparency'
import { createCanvas, paintContext } from './encode'
import { makeError } from '@/utils/errors'
import type { MediaProbe } from '@/types/media'

const SAMPLE_EDGE = 256

export interface ImageProbe {
  probe: MediaProbe
  hasAlpha: boolean
}

/** Merges the alpha finding into the probe so the queue row carries one object. */
export function toProbeWithAlpha(probe: MediaProbe, hasAlpha: boolean): MediaProbe {
  return { ...probe, hasAlpha }
}

/**
 * Decodes once at full size to read the real dimensions, then reads alpha from a
 * downscaled copy — scanning a 60 MP alpha channel to answer a yes/no question
 * would cost more than the compression itself.
 */
export async function probeImage(file: File): Promise<ImageProbe> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch (error) {
    throw makeError(
      'decode-failed',
      'This image could not be decoded',
      'The file may be truncated or use a format this browser cannot read.',
      error instanceof Error ? error.message : String(error),
    )
  }

  try {
    const width = bitmap.width
    const height = bitmap.height
    if (!width || !height) {
      throw makeError('decode-failed', 'This image has no pixels', 'The decoder reported a 0 × 0 frame.')
    }

    return {
      probe: {
        kind: 'image',
        name: file.name,
        sizeBytes: file.size,
        mimeType: file.type || 'image/*',
        dimensions: { width, height },
      },
      hasAlpha: sampleAlpha(bitmap),
    }
  } finally {
    bitmap.close()
  }
}

function sampleAlpha(bitmap: ImageBitmap): boolean {
  const scale = Math.min(1, SAMPLE_EDGE / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = createCanvas(width, height)
  const ctx = paintContext(canvas)
  ctx.clearRect(0, 0, width, height)
  ctx.drawImage(bitmap, 0, 0, width, height)

  const { data } = ctx.getImageData(0, 0, width, height)
  return analyseAlpha(data).hasAlpha
}

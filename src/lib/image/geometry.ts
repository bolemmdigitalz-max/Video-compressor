import type { Dimensions } from '@/types/media'

/**
 * Longest-edge fitting that preserves aspect ratio and never upscales.
 * Odd output sizes are rounded down to even numbers so H.264 and VP8 chroma
 * subsampling stay happy if the image is later handed to the video pipeline.
 */
export function fitWithin(source: Dimensions, maxDimensionPx: number | null): Dimensions {
  const width = Math.max(1, Math.round(source.width))
  const height = Math.max(1, Math.round(source.height))

  if (maxDimensionPx === null || maxDimensionPx <= 0) return { width, height }

  const longest = Math.max(width, height)
  if (longest <= maxDimensionPx) return { width, height }

  const ratio = maxDimensionPx / longest
  return {
    width: Math.max(2, evenDown(width * ratio)),
    height: Math.max(2, evenDown(height * ratio)),
  }
}

export function evenDown(value: number): number {
  const rounded = Math.floor(value)
  return rounded % 2 === 0 ? rounded : rounded - 1
}

/** Scales a video frame so its height matches `targetHeight`, width stays even. */
export function scaleToHeight(source: Dimensions, targetHeight: number): Dimensions {
  if (source.height <= 0) return source
  const ratio = targetHeight / source.height
  return {
    width: Math.max(2, evenDown(source.width * ratio)),
    height: Math.max(2, evenDown(targetHeight)),
  }
}

/** Pixel count, used to warn about very large decode targets. */
export function megapixels({ width, height }: Dimensions): number {
  return (width * height) / 1_000_000
}

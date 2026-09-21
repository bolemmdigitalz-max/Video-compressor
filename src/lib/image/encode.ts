import type { EncodableMime } from './capabilities'

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement

export function createCanvas(width: number, height: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

export function context2d(canvas: AnyCanvas): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null {
  return (
    (canvas.getContext('2d', { willReadFrequently: true }) as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null) ?? null
  )
}

export function paintContext(
  canvas: AnyCanvas,
): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  const ctx = context2d(canvas)
  if (!ctx) throw new Error('2D canvas context unavailable — this browser cannot compress images')
  return ctx
}

/** `OffscreenCanvas.convertToBlob` in a worker, `canvas.toBlob` on the main thread. */
export function encodeCanvas(canvas: AnyCanvas, mimeType: EncodableMime, quality: number): Promise<Blob> {
  if ('convertToBlob' in canvas) {
    return canvas.convertToBlob({ type: mimeType, quality })
  }
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error(`Encoder returned no data for ${mimeType}`))),
      mimeType,
      quality,
    )
  })
}

/** Lossless containers ignore a quality argument; passing one is harmless but misleading in logs. */
export function qualityApplies(mimeType: EncodableMime): boolean {
  return mimeType !== 'image/png'
}

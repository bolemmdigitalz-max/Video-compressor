/// <reference lib="webworker" />
import { compressBitmap } from '@/lib/image/compressImage'
import type { ImageWorkerRequest, ImageWorkerResponse } from '@/types/media'

/**
 * One worker handles one image at a time; the scheduler keeps at most two alive.
 * Bitmaps and blobs cross the boundary by transfer, so nothing is copied twice.
 */
const workerScope = self as unknown as {
  postMessage(message: ImageWorkerResponse, transfer?: Transferable[]): void
  addEventListener(type: 'message', listener: (event: MessageEvent<ImageWorkerRequest>) => void): void
}

async function handle(request: ImageWorkerRequest): Promise<void> {
  const { id, bitmap, settings, sourceSizeBytes, sourceMime, hasAlpha, encodable } = request

  try {
    const output = await compressBitmap({
      bitmap,
      settings,
      hasAlpha,
      sourceMime,
      sourceSizeBytes,
      encodable: new Set(encodable),
    })
    workerScope.postMessage(
      {
        id,
        ok: true,
        blob: output.blob,
        mimeType: output.mimeType,
        dimensions: output.dimensions,
        elapsedMs: output.elapsedMs,
        flattened: output.flattened,
        formatSubstituted: output.formatSubstituted,
      },
      [output.blob],
    )
  } catch (error) {
    if (bitmap.width > 0) bitmap.close()
    workerScope.postMessage({
      id,
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

workerScope.addEventListener('message', (event) => {
  void handle(event.data)
})

export {}

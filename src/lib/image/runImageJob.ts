import { makeError } from '@/utils/errors'
import { outputNameForGeneration } from '@/utils/download'
import type {
  CompressionResult,
  EncodableMimeName,
  ImageSettings,
  ImageWorkerRequest,
  ImageWorkerResponse,
} from '@/types/media'

export interface ImageJobInput {
  file: File
  settings: ImageSettings
  hasAlpha: boolean
  encodable: readonly EncodableMimeName[]
  generation: number
  signal: AbortSignal
}

export interface ImageJobOutcome {
  result: CompressionResult
  flattened: boolean
  formatSubstituted: boolean
}

/**
 * One worker per job, terminated as soon as the blob comes back. Worker startup
 * costs a few milliseconds; keeping idle workers alive would hold canvas memory
 * across a long batch instead.
 */
export async function runImageJob({
  file,
  settings,
  hasAlpha,
  encodable,
  generation,
  signal,
}: ImageJobInput): Promise<ImageJobOutcome> {
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

  if (signal.aborted) {
    bitmap.close()
    throw new DOMException('Compression cancelled', 'AbortError')
  }

  const worker = new Worker(new URL('../../workers/image.worker.ts', import.meta.url), { type: 'module' })
  const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

  try {
    const response = await new Promise<ImageWorkerResponse>((resolve, reject) => {
      const onMessage = (event: MessageEvent<ImageWorkerResponse>) => {
        if (event.data.id !== requestId) return
        worker.removeEventListener('message', onMessage)
        resolve(event.data)
      }
      const onError = (event: ErrorEvent) => {
        worker.removeEventListener('message', onMessage)
        reject(new Error(event.message || 'The image worker stopped unexpectedly'))
      }
      const onAbort = () => {
        worker.removeEventListener('message', onMessage)
        reject(new DOMException('Compression cancelled', 'AbortError'))
      }

      worker.addEventListener('message', onMessage)
      worker.addEventListener('error', onError)
      signal.addEventListener('abort', onAbort, { once: true })

      const request: ImageWorkerRequest = {
        id: requestId,
        bitmap,
        sourceSizeBytes: file.size,
        sourceMime: file.type,
        sourceName: file.name,
        hasAlpha,
        encodable,
        settings,
      }
      worker.postMessage(request, [bitmap])
    })

    if (!response.ok) {
      throw makeError('codec-failed', 'The image encoder failed', 'Try another output format.', response.message)
    }

    const name = outputNameForGeneration(file.name, generation, response.mimeType)
    const outputFile = new File([response.blob], name, { type: response.mimeType })

    return {
      result: {
        file: outputFile,
        sizeBytes: outputFile.size,
        mimeType: response.mimeType,
        dimensions: response.dimensions,
        codecLabel: `${labelForMime(response.mimeType)} image`,
        elapsedMs: response.elapsedMs,
      },
      flattened: response.flattened,
      formatSubstituted: response.formatSubstituted,
    }
  } finally {
    worker.terminate()
  }
}

function labelForMime(mimeType: string): string {
  switch (mimeType) {
    case 'image/jpeg':
      return 'JPEG'
    case 'image/png':
      return 'PNG'
    case 'image/webp':
      return 'WebP'
    case 'image/avif':
      return 'AVIF'
    default:
      return mimeType
  }
}

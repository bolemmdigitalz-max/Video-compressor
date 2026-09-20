export type EncodableMime = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif'

export const CANDIDATE_MIMES: readonly EncodableMime[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
]

let cached: Promise<ReadonlySet<EncodableMime>> | null = null

/**
 * Feature-detects what this browser can actually encode with `canvas.toBlob`.
 * Firefox shipped AVIF encoding in 2024; Safari still refuses it, so the format
 * list is built from this result instead of a hard-coded table.
 */
export function detectEncodableMimes(): Promise<ReadonlySet<EncodableMime>> {
  if (cached) return cached
  cached = (async () => {
    const supported = new Set<EncodableMime>()
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      // Without 2D context only PNG/JPEG are plausible; report those and let
      // compression fail with a clear error rather than pretending otherwise.
      return new Set<EncodableMime>(['image/jpeg', 'image/png'])
    }
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, 1, 1)

    await Promise.all(
      CANDIDATE_MIMES.map(
        (mime) =>
          new Promise<void>((resolve) => {
            try {
              canvas.toBlob(
                (blob) => {
                  if (blob && blob.size > 0 && blob.type === mime) supported.add(mime)
                  resolve()
                },
                mime,
                0.8,
              )
            } catch {
              resolve()
            }
          }),
      ),
    )
    return supported
  })()
  return cached
}

export async function canEncode(mime: EncodableMime): Promise<boolean> {
  return (await detectEncodableMimes()).has(mime)
}

/** True when the document has the isolation headers multithreaded wasm would need. */
export function isCrossOriginIsolated(): boolean {
  return typeof crossOriginIsolated === 'boolean' ? crossOriginIsolated : false
}

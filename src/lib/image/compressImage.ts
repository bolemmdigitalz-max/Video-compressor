import { createCanvas, encodeCanvas, paintContext, qualityApplies } from './encode'
import { fitWithin } from './geometry'
import type { EncodableMime } from './capabilities'
import type { Dimensions, ImageSettings } from '@/types/media'

export interface CompressInput {
  bitmap: ImageBitmap
  sourceSizeBytes: number
  sourceMime: string
  hasAlpha: boolean
  settings: ImageSettings
  encodable: ReadonlySet<EncodableMime>
}

export interface CompressOutput {
  blob: Blob
  mimeType: EncodableMime
  dimensions: Dimensions
  elapsedMs: number
  /** True when the source had alpha and the output container cannot store it. */
  flattened: boolean
  /** True when the requested format was refused and a safe one was used instead. */
  formatSubstituted: boolean
}

const FALLBACK: EncodableMime = 'image/jpeg'

interface MimeDecision {
  mime: EncodableMime
  substituted: boolean
}

function supports(encodable: ReadonlySet<EncodableMime>, mime: string): mime is EncodableMime {
  return (encodable as ReadonlySet<string>).has(mime)
}

/**
 * Chooses the output container. JPEG is the only opaque container we write, so a
 * transparent source is never routed there while `keepTransparency` is on — the
 * spec's "never silently convert transparent images to JPEG".
 */
export function pickMime(
  requested: ImageSettings['format'],
  sourceMime: string,
  hasAlpha: boolean,
  keepTransparency: boolean,
  encodable: ReadonlySet<EncodableMime>,
): MimeDecision {
  const losslessOptions: EncodableMime[] = ['image/png', 'image/webp']

  if (requested === 'png') {
    if (supports(encodable, 'image/png')) return { mime: 'image/png', substituted: false }
    return { mime: FALLBACK, substituted: true }
  }

  if (requested === 'jpeg') {
    if (hasAlpha && keepTransparency) {
      for (const candidate of losslessOptions) {
        if (supports(encodable, candidate)) return { mime: candidate, substituted: true }
      }
    }
    if (supports(encodable, 'image/jpeg')) return { mime: 'image/jpeg', substituted: false }
    return { mime: FALLBACK, substituted: true }
  }

  if (requested === 'webp' && supports(encodable, 'image/webp')) return { mime: 'image/webp', substituted: false }
  if (requested === 'avif' && supports(encodable, 'image/avif')) return { mime: 'image/avif', substituted: false }

  // `keep`, or a requested format this browser cannot encode.
  if (requested === 'keep' && supports(encodable, sourceMime)) {
    return { mime: sourceMime as EncodableMime, substituted: false }
  }
  if (hasAlpha && keepTransparency) {
    for (const candidate of losslessOptions) {
      if (supports(encodable, candidate)) return { mime: candidate, substituted: true }
    }
  }
  return { mime: FALLBACK, substituted: true }
}

/**
 * Encodes one output blob from an already-decoded bitmap. Runs inside a dedicated
 * worker so a 60 MP photo never blocks input handling.
 */
export async function compressBitmap(input: CompressInput): Promise<CompressOutput> {
  const startedAt = performance.now()
  const { bitmap, settings, hasAlpha, encodable } = input

  const source: Dimensions = { width: bitmap.width, height: bitmap.height }
  const target = fitWithin(source, settings.maxDimensionPx)
  const { mime, substituted } = pickMime(
    settings.format,
    input.sourceMime,
    hasAlpha,
    settings.keepTransparency,
    encodable,
  )

  const flatten = hasAlpha && mime === 'image/jpeg'

  const canvas = createCanvas(target.width, target.height)
  const ctx = paintContext(canvas)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  if (flatten) {
    ctx.fillStyle = settings.flattenBackground
    ctx.fillRect(0, 0, target.width, target.height)
  } else {
    ctx.clearRect(0, 0, target.width, target.height)
  }
  ctx.drawImage(bitmap, 0, 0, target.width, target.height)

  const quality = qualityApplies(mime) ? clampQuality(settings.quality) : 1
  const blob = await encodeCanvas(canvas, mime, quality)

  // The bitmap is only borrowed by this call — closing it frees the decode buffer.
  bitmap.close()

  return {
    blob,
    mimeType: mime,
    dimensions: target,
    elapsedMs: performance.now() - startedAt,
    flattened: flatten,
    formatSubstituted: substituted,
  }
}

function clampQuality(quality: number): number {
  if (!Number.isFinite(quality)) return 0.8
  return Math.min(1, Math.max(0.05, quality))
}

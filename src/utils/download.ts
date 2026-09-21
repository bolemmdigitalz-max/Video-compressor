import { makeError } from './errors'
import type { UserFacingError } from '@/types/media'

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'application/zip': 'zip',
}

export function extensionForMime(mimeType: string): string | null {
  return EXTENSION_BY_MIME[mimeType.toLowerCase()] ?? null
}

function splitName(name: string): { base: string; ext: string } {
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return { base: name, ext: '' }
  return { base: name.slice(0, dot), ext: name.slice(dot + 1) }
}

/** `clip.mp4` + `compressed` + `mp4` → `clip-compressed.mp4`. */
export function outputName(sourceName: string, suffix: string, mimeType: string): string {
  const { base, ext } = splitName(sourceName)
  const nextExt = extensionForMime(mimeType) ?? ext
  return nextExt ? `${base}-${suffix}.${nextExt}` : `${base}-${suffix}`
}

/**
 * Names a re-compression by generation: `clip.mp4` → `clip-v1.mp4` → `clip-v2.mp4`.
 * Any existing `-vN` suffix is stripped first so repeated passes do not stack.
 */
export function outputNameForGeneration(sourceName: string, generation: number, mimeType: string): string {
  const { base, ext } = splitName(sourceName)
  const stripped = base.replace(/(?:-v\d+)+$/i, '')
  const nextExt = extensionForMime(mimeType) ?? ext
  const suffix = generation > 0 ? `v${generation}` : 'compressed'
  return nextExt ? `${stripped}-${suffix}.${nextExt}` : `${stripped}-${suffix}`
}

/** `clip-compressed.mp4` + 2 → `clip-compressed-2.mp4`, so ZIP entries never collide. */
export function dedupeName(name: string, taken: ReadonlySet<string>): string {
  if (!taken.has(name.toLowerCase())) return name
  const { base, ext } = splitName(name)
  let counter = 2
  let candidate = ext ? `${base}-${counter}.${ext}` : `${base}-${counter}`
  while (taken.has(candidate.toLowerCase())) {
    counter += 1
    candidate = ext ? `${base}-${counter}.${ext}` : `${base}-${counter}`
  }
  return candidate
}

/** Strips path separators and parent references before a name is used as a ZIP entry. */
export function safeEntryName(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/^\.+/, '')
    .replace(/\.\.+/g, '.')
    .trim()
  return cleaned || 'file'
}

const pendingUrls = new Set<string>()

/**
 * Triggers a browser download. The object URL is revoked on the next tick of the
 * event loop after the click is dispatched, so nothing is left attached to the page.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  pendingUrls.add(url)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => {
    URL.revokeObjectURL(url)
    pendingUrls.delete(url)
  }, 0)
}

export function revokeAllDownloads(): void {
  for (const url of pendingUrls) URL.revokeObjectURL(url)
  pendingUrls.clear()
}

export async function downloadOrExplain(blob: Blob, filename: string): Promise<UserFacingError | null> {
  try {
    if (blob.size === 0) {
      return makeError('download-failed', 'Nothing to save', `The output for ${filename} is 0 bytes.`)
    }
    downloadBlob(blob, filename)
    return null
  } catch (error) {
    return makeError(
      'download-failed',
      'Download blocked',
      'The browser refused to start the download. Allow pop-ups for this page and try again.',
      error instanceof Error ? error.message : String(error),
    )
  }
}

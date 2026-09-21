import JSZip from 'jszip'
import { dedupeName, safeEntryName } from '@/utils/download'
import { makeError } from '@/utils/errors'
import type { UserFacingError } from '@/types/media'

export interface ZipEntry {
  name: string
  blob: Blob
}

export interface ZipOutcome {
  blob: Blob
  /** Names in the order they were added, after collision handling. */
  entries: string[]
}

/**
 * Builds a ZIP in memory. Names are sanitised and de-duplicated first: two clips
 * called `export.mp4` must not overwrite each other inside the archive.
 */
export async function createZip(
  entries: readonly ZipEntry[],
  onProgress: (ratio: number) => void,
): Promise<ZipOutcome> {
  if (entries.length === 0) {
    throw makeError('zip-failed', 'Nothing to archive', 'Select at least one finished file first.')
  }

  const zip = new JSZip()
  const taken = new Set<string>()
  const added: string[] = []

  for (const entry of entries) {
    const name = dedupeName(safeEntryName(entry.name), taken)
    taken.add(name.toLowerCase())
    added.push(name)
    // STORED would keep the file at its original size; DEFLATE costs a little CPU
    // but re-shrinks containers that already carry compressed streams.
    zip.file(name, entry.blob, { binary: true })
  }

  try {
    const blob = await zip.generateAsync(
      { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 4 } },
      (metadata) => onProgress(Math.min(1, metadata.percent / 100)),
    )
    return { blob, entries: added }
  } catch (error) {
    throw makeError(
      'zip-failed',
      'The archive could not be written',
      'Downloading the files one at a time avoids the archive step entirely.',
      error instanceof Error ? error.message : String(error),
    )
  }
}

export function zipFileName(count: number): string {
  const stamp = new Date().toISOString().slice(0, 10)
  return `compressly-${count}-file${count === 1 ? '' : 's'}-${stamp}.zip`
}

/** Surfaces a typed error instead of a bare throw, for callers that must not crash. */
export function asZipError(error: unknown): UserFacingError {
  if (error && typeof error === 'object' && 'code' in error) return error as UserFacingError
  return makeError(
    'zip-failed',
    'The archive could not be written',
    'Try downloading the files individually instead.',
    error instanceof Error ? error.message : String(error),
  )
}

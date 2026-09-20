import type { ErrorCode, UserFacingError } from '@/types/media'

const MAX_REASONABLE_BYTES = 12 * 1024 * 1024 * 1024

interface FailurePattern {
  test: RegExp
  code: ErrorCode
}

const PATTERNS: readonly FailurePattern[] = [
  { test: /out of memory|allocation failed|oom|memory access out of bounds/i, code: 'out-of-memory' },
  { test: /unknown encoder|encoder .* not found|codec not .*supported|invalid encoder/i, code: 'codec-failed' },
  { test: /invalid data found|moov atom not found|could not find codec|does not contain any stream/i, code: 'decode-failed' },
  { test: /aborted|abort/i, code: 'cancelled' },
]

function message(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

export function makeError(
  code: ErrorCode,
  title: string,
  detail: string,
  diagnostic?: string,
): UserFacingError {
  return diagnostic === undefined ? { code, title, detail } : { code, title, detail, diagnostic }
}

/**
 * Turns anything thrown by FFmpeg, the canvas pipeline or the browser into a
 * two-line message a person can act on. The raw text is preserved as
 * `diagnostic` and only rendered in development builds.
 */
export function classifyError(error: unknown): UserFacingError {
  const text = message(error)

  if (error instanceof DOMException && error.name === 'AbortError') {
    return makeError('cancelled', 'Cancelled', 'Nothing was written for this file.')
  }

  for (const pattern of PATTERNS) {
    if (pattern.test.test(text)) {
      switch (pattern.code) {
        case 'out-of-memory':
          return makeError(
            'out-of-memory',
            'Not enough memory',
            'Lower the resolution or split the clip into shorter parts, then retry.',
            text,
          )
        case 'codec-failed':
          return makeError(
            'codec-failed',
            'Encoder rejected this file',
            'Switch the output format or lower the quality setting, then retry.',
            text,
          )
        case 'decode-failed':
          return makeError(
            'decode-failed',
            'Could not read this file',
            'The container is damaged or uses a stream the browser build cannot decode.',
            text,
          )
        case 'cancelled':
          return makeError('cancelled', 'Cancelled', 'Nothing was written for this file.')
        default:
          break
      }
    }
  }

  return makeError('unknown', 'Compression stopped', 'Retry once — if it fails again, try a lower resolution.', text)
}

export function classifyUpload(file: File, kind: 'image' | 'video'): UserFacingError | null {
  if (file.size === 0) {
    return makeError('empty-file', 'Empty file', `${file.name} is 0 bytes, so there is nothing to compress.`)
  }
  if (file.size > MAX_REASONABLE_BYTES) {
    return makeError(
      'too-large',
      'File is too large',
      `This build handles up to 12 GB per file. ${file.name} is bigger than that.`,
    )
  }
  const type = file.type.toLowerCase()
  if (kind === 'image') {
    const ok = type.startsWith('image/')
    if (!ok) {
      return makeError('unsupported-media', 'Not an image', `${file.name} is reported as "${type || 'unknown type'}".`)
    }
  } else {
    const ok = type.startsWith('video/') || type === 'application/octet-stream'
    if (!ok) {
      return makeError('unsupported-media', 'Not a video', `${file.name} is reported as "${type || 'unknown type'}".`)
    }
  }
  return null
}

export function diagnosticOf(error: UserFacingError | undefined): string | null {
  if (!error?.diagnostic) return null
  return error.diagnostic
}

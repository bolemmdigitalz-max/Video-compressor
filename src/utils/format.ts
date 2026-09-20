import type { Dimensions } from '@/types/media'

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const

/**
 * Decimal units (1 KB = 1000 B), matching how file managers and phone storage
 * report media. Binary units would make a 100 MB video read "95.4 MB".
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return '—'
  const abs = Math.abs(bytes)
  if (abs < 1000) return `${Math.round(bytes)} B`

  let value = bytes
  let unit = 0
  while (Math.abs(value) >= 1000 && unit < UNITS.length - 1) {
    value /= 1000
    unit += 1
  }
  const digits = Math.abs(value) < 10 ? 2 : Math.abs(value) < 100 ? 1 : 0
  return `${value.toFixed(digits)} ${UNITS[unit]}`
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  const totalSeconds = Math.round(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`
}

export function formatResolution({ width, height }: Dimensions): string {
  if (!width || !height) return 'unknown size'
  return `${Math.round(width)} × ${Math.round(height)}`
}

/** Short height label used by the resolution picker. */
export function resolutionLabel(height: number): string {
  return `${height}p`
}

export interface Savings {
  /** Negative when the output grew. */
  savedBytes: number
  /** Percentage of the original removed. Negative when the output grew. */
  percent: number
  grew: boolean
}

/**
 * Single source of truth for every "smaller" number in the UI.
 * A zero-byte input yields 0% rather than NaN or Infinity.
 */
export function computeSavings(originalBytes: number, outputBytes: number): Savings {
  const savedBytes = originalBytes - outputBytes
  if (!(originalBytes > 0)) {
    return { savedBytes: 0, percent: 0, grew: false }
  }
  const percent = (savedBytes / originalBytes) * 100
  return { savedBytes, percent, grew: savedBytes < 0 }
}

export function formatPercent(percent: number, digits = 0): string {
  if (!Number.isFinite(percent)) return '—'
  return `${percent.toFixed(digits)}%`
}

/** "69% smaller" / "8% larger" / "same size" — never claims savings that did not happen. */
export function describeSavings(originalBytes: number, outputBytes: number): string {
  const { percent, grew } = computeSavings(originalBytes, outputBytes)
  if (Math.abs(percent) < 0.05) return 'same size'
  return grew ? `${formatPercent(Math.abs(percent))} larger` : `${formatPercent(Math.abs(percent))} smaller`
}

export function formatSpeed(bytesPerSecond: number): string {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return '—'
  return `${formatBytes(bytesPerSecond)}/s`
}

export function formatClock(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)} s`
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds % 60)
  return `${minutes}m ${rest}s`
}

import { computeSavings } from '@/utils/format'
import type { Generation } from '@/types/media'

export interface GenerationRow extends Generation {
  /** Savings versus the immediately preceding entry. */
  fromPreviousBytes: number
  fromPreviousPercent: number
  /** Savings versus entry 0, the untouched upload. */
  fromOriginalBytes: number
  fromOriginalPercent: number
  isOriginal: boolean
}

/** Builds the annotated chain used by the history panel. */
export function buildChain(generations: readonly Generation[]): GenerationRow[] {
  const original = generations[0]
  if (!original) return []

  return generations.map((generation, index) => {
    const previous = index === 0 ? generation : (generations[index - 1] ?? generation)
    const previousSavings = computeSavings(previous.sizeBytes, generation.sizeBytes)
    const originalSavings = computeSavings(original.sizeBytes, generation.sizeBytes)
    return {
      ...generation,
      fromPreviousBytes: previousSavings.savedBytes,
      fromPreviousPercent: previousSavings.percent,
      fromOriginalBytes: originalSavings.savedBytes,
      fromOriginalPercent: originalSavings.percent,
      isOriginal: index === 0,
    }
  })
}

/**
 * True when the last pass bought less than 2% — the point at which another pass
 * costs quality for almost nothing, which the UI states rather than hides.
 */
export function diminishingReturns(rows: readonly GenerationRow[], thresholdPercent = 2): boolean {
  const last = rows[rows.length - 1]
  if (!last || last.isOriginal) return false
  return last.fromPreviousPercent < thresholdPercent
}

export function totalSavings(rows: readonly GenerationRow[]): { savedBytes: number; percent: number } {
  const last = rows[rows.length - 1]
  if (!last) return { savedBytes: 0, percent: 0 }
  return { savedBytes: last.fromOriginalBytes, percent: last.fromOriginalPercent }
}

/** Generation index for a file that has already been through `generation` passes. */
export function nextGeneration(current: number): number {
  return current + 1
}

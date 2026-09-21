import { describe, expect, it } from 'vitest'
import { buildChain, diminishingReturns, nextGeneration, totalSavings } from './generations'
import type { Generation } from '@/types/media'

const generation = (index: number, sizeBytes: number): Generation => ({
  index,
  name: index === 0 ? 'source.mp4' : `source-v${index}.mp4`,
  sizeBytes,
  dimensions: { width: 1920, height: 1080 },
  codecLabel: 'H.264 · MP4 · AAC',
  mimeType: 'video/mp4',
  createdAt: index,
})

describe('buildChain', () => {
  it('annotates the original as the baseline', () => {
    const rows = buildChain([generation(0, 100_000_000)])
    expect(rows).toHaveLength(1)
    expect(rows[0]?.isOriginal).toBe(true)
    expect(rows[0]?.fromOriginalPercent).toBe(0)
    expect(rows[0]?.fromPreviousPercent).toBe(0)
  })

  it('computes both per-pass and cumulative savings', () => {
    const rows = buildChain([
      generation(0, 100_000_000),
      generation(1, 31_000_000),
      generation(2, 24_000_000),
    ])

    expect(rows[1]?.fromOriginalPercent).toBeCloseTo(69, 5)
    expect(rows[1]?.fromPreviousPercent).toBeCloseTo(69, 5)

    expect(rows[2]?.fromPreviousPercent).toBeCloseTo(((31 - 24) / 31) * 100, 5)
    expect(rows[2]?.fromOriginalPercent).toBeCloseTo(76, 5)
    expect(rows[2]?.fromOriginalBytes).toBe(76_000_000)
  })

  it('handles an empty chain', () => {
    expect(buildChain([])).toEqual([])
  })

  it('reports a pass that grew the file', () => {
    const rows = buildChain([generation(0, 10_000_000), generation(1, 12_000_000)])
    expect(rows[1]?.fromPreviousPercent).toBeCloseTo(-20, 5)
    expect(rows[1]?.fromOriginalBytes).toBe(-2_000_000)
  })
})

describe('diminishingReturns', () => {
  it('is false for a single original', () => {
    expect(diminishingReturns(buildChain([generation(0, 100_000_000)]))).toBe(false)
  })

  it('is true when the last pass bought almost nothing', () => {
    const rows = buildChain([
      generation(0, 100_000_000),
      generation(1, 31_000_000),
      generation(2, 30_800_000),
    ])
    expect(diminishingReturns(rows)).toBe(true)
  })

  it('is false while passes still pay off', () => {
    const rows = buildChain([generation(0, 100_000_000), generation(1, 31_000_000)])
    expect(diminishingReturns(rows)).toBe(false)
  })

  it('treats a growing pass as diminishing', () => {
    const rows = buildChain([generation(0, 10_000_000), generation(1, 12_000_000)])
    expect(diminishingReturns(rows)).toBe(true)
  })
})

describe('totalSavings', () => {
  it('measures against the original upload only', () => {
    const rows = buildChain([
      generation(0, 100_000_000),
      generation(1, 31_000_000),
      generation(2, 24_000_000),
    ])
    expect(totalSavings(rows)).toEqual({ savedBytes: 76_000_000, percent: 76 })
  })

  it('is zero for an empty chain', () => {
    expect(totalSavings([])).toEqual({ savedBytes: 0, percent: 0 })
  })
})

describe('nextGeneration', () => {
  it('increments', () => {
    expect(nextGeneration(0)).toBe(1)
    expect(nextGeneration(3)).toBe(4)
  })
})

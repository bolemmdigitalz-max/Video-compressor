import { describe, expect, it } from 'vitest'
import {
  computeSavings,
  describeSavings,
  formatBytes,
  formatClock,
  formatDuration,
  formatPercent,
  formatResolution,
} from './format'

describe('formatBytes', () => {
  it('uses decimal units', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(999)).toBe('999 B')
    expect(formatBytes(1000)).toBe('1.00 KB')
    expect(formatBytes(1500)).toBe('1.50 KB')
    expect(formatBytes(15_000)).toBe('15.0 KB')
    expect(formatBytes(100_000_000)).toBe('100 MB')
    expect(formatBytes(31_000_000)).toBe('31.0 MB')
  })

  it('does not lose the sign or blow up on junk', () => {
    expect(formatBytes(-2048)).toBe('-2.05 KB')
    expect(formatBytes(Number.NaN)).toBe('—')
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe('—')
  })
})

describe('formatDuration', () => {
  it('formats under an hour as m:ss', () => {
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(65_000)).toBe('1:05')
  })

  it('adds hours past one hour', () => {
    expect(formatDuration(3_725_000)).toBe('1:02:05')
  })

  it('rejects nonsense', () => {
    expect(formatDuration(-5)).toBe('—')
    expect(formatDuration(Number.NaN)).toBe('—')
  })
})

describe('formatResolution', () => {
  it('prints width × height', () => {
    expect(formatResolution({ width: 1920, height: 1080 })).toBe('1920 × 1080')
  })

  it('says unknown instead of "0 × 0"', () => {
    expect(formatResolution({ width: 0, height: 1080 })).toBe('unknown size')
  })
})

describe('computeSavings', () => {
  it('matches the brief example: 100 MB to 31 MB is 69% smaller', () => {
    const savings = computeSavings(100_000_000, 31_000_000)
    expect(savings.savedBytes).toBe(69_000_000)
    expect(savings.percent).toBeCloseTo(69, 5)
    expect(savings.grew).toBe(false)
  })

  it('reports growth as negative savings', () => {
    const savings = computeSavings(1_000_000, 1_200_000)
    expect(savings.grew).toBe(true)
    expect(savings.percent).toBeCloseTo(-20, 5)
  })

  it('returns 0% rather than NaN or Infinity for a zero-byte source', () => {
    expect(computeSavings(0, 500)).toEqual({ savedBytes: 0, percent: 0, grew: false })
    expect(computeSavings(0, 0)).toEqual({ savedBytes: 0, percent: 0, grew: false })
  })
})

describe('describeSavings', () => {
  it('never claims savings that did not happen', () => {
    expect(describeSavings(100_000_000, 31_000_000)).toBe('69% smaller')
    expect(describeSavings(1_000_000, 1_200_000)).toBe('20% larger')
    expect(describeSavings(1_000_000, 1_000_000)).toBe('same size')
    expect(describeSavings(0, 0)).toBe('same size')
  })
})

describe('formatPercent', () => {
  it('honours precision and rejects non-finite input', () => {
    expect(formatPercent(69)).toBe('69%')
    expect(formatPercent(12.3456, 1)).toBe('12.3%')
    expect(formatPercent(Number.NaN)).toBe('—')
  })
})

describe('formatClock', () => {
  it('picks a unit that fits the value', () => {
    expect(formatClock(450)).toBe('450 ms')
    expect(formatClock(4_500)).toBe('4.5 s')
    expect(formatClock(45_000)).toBe('45 s')
    expect(formatClock(125_000)).toBe('2m 5s')
  })
})

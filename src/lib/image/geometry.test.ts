import { describe, expect, it } from 'vitest'
import { evenDown, fitWithin, megapixels, scaleToHeight } from './geometry'

describe('fitWithin', () => {
  it('keeps the source size when no cap is set', () => {
    expect(fitWithin({ width: 4032, height: 3024 }, null)).toEqual({ width: 4032, height: 3024 })
  })

  it('never upscales a smaller image', () => {
    expect(fitWithin({ width: 800, height: 600 }, 2000)).toEqual({ width: 800, height: 600 })
  })

  it('scales the longest edge and preserves aspect ratio', () => {
    expect(fitWithin({ width: 4000, height: 2000 }, 2000)).toEqual({ width: 2000, height: 1000 })
    expect(fitWithin({ width: 2000, height: 4000 }, 2000)).toEqual({ width: 1000, height: 2000 })
  })

  it('rounds both edges to even numbers for encoder compatibility', () => {
    const result = fitWithin({ width: 4001, height: 3001 }, 1000)
    expect(result.width % 2).toBe(0)
    expect(result.height % 2).toBe(0)
  })

  it('clamps absurd input to something encodable', () => {
    expect(fitWithin({ width: 0, height: 0 }, null)).toEqual({ width: 1, height: 1 })
    expect(fitWithin({ width: 1000, height: 1 }, 10)).toEqual({ width: 10, height: 2 })
  })
})

describe('scaleToHeight', () => {
  it('targets the height and keeps the width even', () => {
    const result = scaleToHeight({ width: 3840, height: 2160 }, 720)
    expect(result).toEqual({ width: 1280, height: 720 })
  })

  it('tolerates a zero-height source', () => {
    expect(scaleToHeight({ width: 100, height: 0 }, 720)).toEqual({ width: 100, height: 0 })
  })
})

describe('evenDown', () => {
  it('floors to the nearest even integer', () => {
    expect(evenDown(7.9)).toBe(6)
    expect(evenDown(8)).toBe(8)
    expect(evenDown(1)).toBe(0)
  })
})

describe('megapixels', () => {
  it('divides by one million', () => {
    expect(megapixels({ width: 4000, height: 3000 })).toBeCloseTo(12, 5)
  })
})

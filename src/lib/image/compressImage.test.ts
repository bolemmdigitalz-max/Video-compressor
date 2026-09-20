import { describe, expect, it } from 'vitest'
import { pickMime } from './compressImage'
import type { EncodableMime } from './capabilities'

const ALL = new Set<EncodableMime>(['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
const NO_AVIF = new Set<EncodableMime>(['image/jpeg', 'image/png', 'image/webp'])
const JPEG_PNG = new Set<EncodableMime>(['image/jpeg', 'image/png'])

describe('pickMime', () => {
  it('keeps the source format when the browser can write it back', () => {
    expect(pickMime('keep', 'image/webp', false, true, ALL)).toEqual({
      mime: 'image/webp',
      substituted: false,
    })
  })

  it('routes a transparent source away from JPEG while transparency is protected', () => {
    const decision = pickMime('jpeg', 'image/png', true, true, ALL)
    expect(decision.mime).toBe('image/png')
    expect(decision.substituted).toBe(true)
  })

  it('allows JPEG once the user opts out of transparency', () => {
    expect(pickMime('jpeg', 'image/png', true, false, ALL).mime).toBe('image/jpeg')
  })

  it('lets an opaque source through to JPEG unchanged', () => {
    expect(pickMime('jpeg', 'image/jpeg', false, true, ALL)).toEqual({
      mime: 'image/jpeg',
      substituted: false,
    })
  })

  it('prefers PNG for a transparent source with an unwritable format', () => {
    expect(pickMime('keep', 'image/gif', true, true, ALL)).toEqual({
      mime: 'image/png',
      substituted: true,
    })
  })

  it('falls back to WebP when PNG is unavailable', () => {
    const encodable = new Set<EncodableMime>(['image/jpeg', 'image/webp'])
    expect(pickMime('keep', 'image/gif', true, true, encodable).mime).toBe('image/webp')
  })

  it('drops AVIF where the browser cannot encode it', () => {
    expect(pickMime('avif', 'image/png', false, true, NO_AVIF)).toEqual({
      mime: 'image/jpeg',
      substituted: true,
    })
  })

  it('accepts AVIF where the browser can encode it', () => {
    expect(pickMime('avif', 'image/png', false, true, ALL)).toEqual({
      mime: 'image/avif',
      substituted: false,
    })
  })

  it('honours an explicit PNG request', () => {
    expect(pickMime('png', 'image/jpeg', false, true, JPEG_PNG)).toEqual({
      mime: 'image/png',
      substituted: false,
    })
  })

  it('falls back to JPEG when nothing else is encodable', () => {
    const jpegOnly = new Set<EncodableMime>(['image/jpeg'])
    expect(pickMime('png', 'image/png', true, true, jpegOnly)).toEqual({
      mime: 'image/jpeg',
      substituted: true,
    })
  })
})

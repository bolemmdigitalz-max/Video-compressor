import { describe, expect, it } from 'vitest'
import {
  CRF_RANGE,
  PRESETS,
  clampCrf,
  codecsForContainer,
  defaultVideoSettings,
  presetById,
  qualityAdjective,
} from './presets'
import { isSupportedCombination } from './args'

describe('PRESETS', () => {
  it('ships the four presets the brief asks for', () => {
    expect(PRESETS.map((preset) => preset.id)).toEqual(['fast', 'balanced', 'small', 'custom'])
  })

  it('keeps every preset within its codec CRF range', () => {
    for (const preset of PRESETS) {
      const range = CRF_RANGE[preset.settings.videoCodec]
      expect(preset.settings.crf).toBeGreaterThanOrEqual(range.min)
      expect(preset.settings.crf).toBeLessThanOrEqual(range.max)
    }
  })

  it('only advertises container/codec pairs that exist', () => {
    for (const preset of PRESETS) {
      const { container, videoCodec, audioCodec } = preset.settings
      expect(isSupportedCombination(container, videoCodec, audioCodec)).toBe(true)
    }
  })

  it('describes what each preset changes instead of using vague adjectives', () => {
    for (const preset of PRESETS) {
      expect(preset.description.length).toBeGreaterThan(8)
      expect(/best|ultimate|amazing|perfect|seamless/i.test(preset.description)).toBe(false)
    }
  })
})

describe('presetById', () => {
  it('falls back to the first preset for an unknown id', () => {
    expect(presetById('nope' as 'fast').id).toBe('fast')
  })
})

describe('defaultVideoSettings', () => {
  it('returns a copy, so mutating it cannot change the preset table', () => {
    const settings = defaultVideoSettings()
    settings.crf = 40
    expect(presetById('balanced').settings.crf).toBe(24)
  })
})

describe('codecsForContainer', () => {
  it('pairs containers with their codecs', () => {
    expect(codecsForContainer('mp4')).toEqual({ video: 'libx264', audio: 'aac' })
    expect(codecsForContainer('webm')).toEqual({ video: 'libvpx', audio: 'libopus' })
  })
})

describe('clampCrf', () => {
  it('clamps to the codec range', () => {
    expect(clampCrf('libx264', 5)).toBe(16)
    expect(clampCrf('libx264', 99)).toBe(40)
    expect(clampCrf('libvpx', 99)).toBe(50)
  })

  it('uses the recommended value for junk input', () => {
    expect(clampCrf('libx264', Number.NaN)).toBe(24)
    expect(clampCrf('libvpx', Number.NaN)).toBe(32)
  })

  it('rounds half steps to an integer', () => {
    expect(clampCrf('libx264', 23.6)).toBe(24)
  })
})

describe('qualityAdjective', () => {
  it('labels the position within the codec range', () => {
    expect(qualityAdjective('libx264', 16)).toBe('near-lossless')
    expect(qualityAdjective('libx264', 24)).toBe('high')
    expect(qualityAdjective('libx264', 28)).toBe('balanced')
    expect(qualityAdjective('libx264', 31)).toBe('reduced')
    expect(qualityAdjective('libx264', 40)).toBe('aggressive')
  })
})

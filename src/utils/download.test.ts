import { describe, expect, it } from 'vitest'
import { dedupeName, extensionForMime, outputName, safeEntryName } from './download'

describe('extensionForMime', () => {
  it('maps the containers this tool writes', () => {
    expect(extensionForMime('image/jpeg')).toBe('jpg')
    expect(extensionForMime('video/mp4')).toBe('mp4')
    expect(extensionForMime('video/webm')).toBe('webm')
    expect(extensionForMime('application/zip')).toBe('zip')
  })

  it('returns null for an unknown type', () => {
    expect(extensionForMime('video/x-matroska')).toBeNull()
  })
})

describe('outputName', () => {
  it('inserts the suffix before the extension', () => {
    expect(outputName('holiday.mp4', 'compressed', 'video/mp4')).toBe('holiday-compressed.mp4')
  })

  it('changes the extension when the container changes', () => {
    expect(outputName('holiday.mp4', 'compressed', 'video/webm')).toBe('holiday-compressed.webm')
  })

  it('keeps the original extension for an unknown mime', () => {
    expect(outputName('clip.mov', 'compressed', 'video/quicktime')).toBe('clip-compressed.mov')
  })

  it('handles a name with no extension and one with dots in it', () => {
    expect(outputName('clip', 'compressed', 'video/mp4')).toBe('clip-compressed.mp4')
    expect(outputName('v1.2.final.mp4', 'compressed', 'video/mp4')).toBe('v1.2.final-compressed.mp4')
  })
})

describe('dedupeName', () => {
  it('leaves an unused name alone', () => {
    expect(dedupeName('clip.mp4', new Set())).toBe('clip.mp4')
  })

  it('appends a counter on collision, case-insensitively', () => {
    const taken = new Set(['clip.mp4', 'clip-2.mp4'])
    expect(dedupeName('CLIP.mp4', taken)).toBe('CLIP-3.mp4')
  })

  it('keeps counting until it finds a free name', () => {
    const taken = new Set(['a.mp4', 'a-2.mp4', 'a-3.mp4', 'a-4.mp4'])
    expect(dedupeName('a.mp4', taken)).toBe('a-5.mp4')
  })

  it('handles a name with no extension', () => {
    expect(dedupeName('clip', new Set(['clip']))).toBe('clip-2')
  })
})

describe('safeEntryName', () => {
  it('strips path traversal', () => {
    const result = safeEntryName('../../etc/passwd')
    expect(result).not.toContain('..')
    expect(result).not.toContain('/')
    expect(result).not.toContain('\\')
  })

  it('replaces characters that break archives', () => {
    expect(safeEntryName('a:b*c?.mp4')).toBe('a_b_c_.mp4')
  })

  it('never returns an empty entry', () => {
    expect(safeEntryName('   ')).toBe('file')
    expect(safeEntryName('')).toBe('file')
    expect(safeEntryName('...')).toBe('file')
  })
})

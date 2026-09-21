import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

/**
 * jsdom ships no canvas, no ImageBitmap and no object URLs. These are the minimum
 * platform pieces the image probe touches; the application code under test is the
 * real thing, only the browser primitive is substituted.
 */
class FakeContext2D {
  fillStyle = '#000'
  imageSmoothingEnabled = true
  imageSmoothingQuality = 'high'
  clearRect(): void {}
  fillRect(): void {}
  drawImage(): void {}
  getImageData(_x: number, _y: number, width: number, height: number) {
    // Opaque by default; individual tests can override the alpha channel.
    const data = new Uint8ClampedArray(width * height * 4)
    data.fill(255)
    return { data, width, height }
  }
}

// The ffmpeg integration suite runs in the node environment, where none of these
// browser primitives exist. Everything below is jsdom-only.
if (typeof HTMLCanvasElement !== 'undefined') {
  const proto = HTMLCanvasElement.prototype as unknown as {
    getContext: unknown
    toBlob: unknown
  }
  proto.getContext = () => new FakeContext2D()
  proto.toBlob = function toBlob(
    this: HTMLCanvasElement,
    callback: (blob: Blob | null) => void,
    type?: string,
  ): void {
    callback(new Blob(['fake-encoded-bytes'], { type: type ?? 'image/png' }))
  }

  globalThis.createImageBitmap = vi.fn(async () => ({
    width: 1600,
    height: 1200,
    close: vi.fn(),
  })) as unknown as typeof createImageBitmap

  if (!URL.createObjectURL) {
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:fake'),
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    })
  }
}

afterEach(() => {
  cleanup()
  if (typeof localStorage !== 'undefined') localStorage.clear()
  if (typeof document !== 'undefined') document.documentElement.classList.remove('dark')
})

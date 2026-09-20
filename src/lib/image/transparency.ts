export interface AlphaReport {
  /** True when at least one sampled pixel is not fully opaque. */
  hasAlpha: true | false
  /** Fraction of sampled pixels that are fully transparent (alpha 0). */
  transparentRatio: number
  /** Fraction of sampled pixels with 0 < alpha < 255 — a real alpha ramp, not a mask. */
  featheredRatio: number
  samples: number
}

const MAX_SAMPLES = 400_000

/**
 * Samples the alpha channel with a stride so a 60 MP photo costs the same as a
 * thumbnail. Used to decide whether flattening to JPEG would destroy information.
 */
export function analyseAlpha(data: Uint8ClampedArray): AlphaReport {
  const pixelCount = data.length / 4
  const stride = Math.max(1, Math.ceil(pixelCount / MAX_SAMPLES))
  let transparent = 0
  let feathered = 0
  let samples = 0

  for (let pixel = 0; pixel < pixelCount; pixel += stride) {
    const alpha = data[pixel * 4 + 3] ?? 255
    samples += 1
    if (alpha === 0) transparent += 1
    else if (alpha < 255) feathered += 1
  }

  if (samples === 0) return { hasAlpha: false, transparentRatio: 0, featheredRatio: 0, samples: 0 }

  return {
    hasAlpha: transparent + feathered > 0,
    transparentRatio: transparent / samples,
    featheredRatio: feathered / samples,
    samples,
  }
}

/* The pond, and what counts as its water.
 *
 * The hero's ripples belong on water and nowhere else, and the art is a
 * painting: nothing in the file says where its water is. The pixels are asked
 * instead, and they are asked twice, because two different jobs need the
 * answer.
 *
 * A pointer asks about one point, to decide whether a ripple starts there. The
 * mask asks about every pixel it covers, to decide which ripple pixels
 * survive the composite. The two readings share most of their thresholds and
 * differ where the jobs differ; the differences are commented where they sit.
 *
 * The mask is built once at a fixed 384 by 256 and drawn up to the art's
 * size when it is composited. The size is a budget: the whole build has to fit
 * inside the idle start's 50 millisecond task, and rebuilding at the art's own
 * resolution is a multi-megapixel read every time the wrap changes size. What
 * the smaller grid costs is precision at the water's edge, and `water.test.ts`
 * holds that cost to a measured bound over the encode the page ships.
 *
 * Nothing here allocates until the factory runs, and the factory allocates
 * nothing until it is asked to build.
 */

/** The grid the water is read on, and the mask's own size. */
export const SAMPLE_WIDTH = 384
export const SAMPLE_HEIGHT = 256

/** The pond's edge, as fractions of the art's width and height. */
const POND: readonly (readonly [number, number])[] = [
  [0.4, 0.58],
  [0.49, 0.58],
  [0.55, 0.61],
  [0.59, 0.66],
  [0.6, 0.73],
  [0.58, 0.8],
  [0.53, 0.89],
  [0.49, 0.93],
  [0.42, 0.93],
  [0.36, 0.89],
  [0.34, 0.83],
  [0.35, 0.76],
  [0.37, 0.69],
  [0.39, 0.63],
]

/**
 * True where a point in normalized art coordinates falls inside the pond.
 *
 * A ray cast along the point's row: every edge that crosses the row to the
 * point's right flips the answer, so an odd number of crossings means inside.
 */
export function pointInPond(x: number, y: number): boolean {
  let inside = false

  for (let i = 0, j = POND.length - 1; i < POND.length; j = i++) {
    const [xi, yi] = POND[i]
    const [xj, yj] = POND[j]
    const crosses = yi > y !== yj > y
    const edgeX = ((xj - xi) * (y - yi)) / (yj - yi) + xi

    if (crosses && x < edgeX) inside = !inside
  }

  return inside
}

/**
 * The pond as a path, sized to a box.
 *
 * The curve is what the mask is cut to and what the ripple strokes are
 * clipped to. It reads the same edge the polygon walks, smoothly. The two
 * never have to agree pixel for pixel: the polygon answers a pointer, and the
 * curve cuts a shape.
 */
export function pondClip(width: number, height: number): Path2D {
  const path = new Path2D()

  path.moveTo(width * 0.4, height * 0.58)
  path.bezierCurveTo(
    width * 0.45,
    height * 0.57,
    width * 0.51,
    height * 0.58,
    width * 0.55,
    height * 0.61,
  )
  path.bezierCurveTo(
    width * 0.58,
    height * 0.64,
    width * 0.61,
    height * 0.69,
    width * 0.6,
    height * 0.73,
  )
  path.bezierCurveTo(
    width * 0.6,
    height * 0.8,
    width * 0.54,
    height * 0.89,
    width * 0.49,
    height * 0.93,
  )
  path.bezierCurveTo(
    width * 0.43,
    height * 0.95,
    width * 0.37,
    height * 0.91,
    width * 0.34,
    height * 0.83,
  )
  path.bezierCurveTo(
    width * 0.33,
    height * 0.76,
    width * 0.37,
    height * 0.65,
    width * 0.4,
    height * 0.58,
  )
  path.closePath()

  return path
}

/**
 * True where a sampled color reads as water to a pointer.
 *
 * Green has to lead red, blue has to lead both red and most of green, and the
 * cool contrast — how far blue and green together run past twice red — has to
 * clear 32. The ratios alone pass any well lit surface; the contrast is what
 * separates water from the stone and moss around it.
 */
export function isWaterColor(
  red: number,
  green: number,
  blue: number,
  alpha: number,
): boolean {
  return (
    alpha > 48 &&
    green > red * 1.06 &&
    blue > red * 1.12 &&
    blue > green * 0.9 &&
    blue + green - red * 2 > 32
  )
}

/**
 * True where a sampled color belongs in the water mask.
 *
 * Two thresholds differ from the pointer's reading, and both follow from the
 * mask being cut to the pond curve before its pixels are read. The cut
 * arrives part transparent along the curve, so alpha only has to clear 28
 * here: asking for the pointer's 48 would leave a bare line where the water
 * ends. Blue has to clear 46 outright, which no ratio asks for: a dark pixel
 * can hold every ratio and still be shadow, and shadow inside the mask
 * carries ripples onto stone.
 */
export function isMaskColor(
  red: number,
  green: number,
  blue: number,
  alpha: number,
): boolean {
  return (
    alpha > 28 &&
    green > red * 1.06 &&
    blue > red * 1.12 &&
    blue > 46 &&
    blue > green * 0.9 &&
    blue + green - red * 2 > 32
  )
}

/**
 * The mask's alpha for a sampled color, and 0 where it is not water.
 *
 * Water keeps 78% of the alpha it arrived with at the contrast threshold and
 * all of it 85 counts above. The ramp softens the water's edge: the colors
 * that only just pass are the ones where water meets stone, and holding them
 * at full alpha prints the mask's own outline into the ripples.
 */
export function maskAlpha(
  red: number,
  green: number,
  blue: number,
  alpha: number,
): number {
  if (!isMaskColor(red, green, blue, alpha)) return 0

  const coolContrast = blue + green - red * 2

  return Math.round(Math.min(1, 0.78 + (coolContrast - 32) / 85) * alpha)
}

/** The pond's water, as the hero's ripples ask about it. */
export interface Water {
  /**
   * Samples the art and cuts the mask. Reads pixels back from two
   * canvases, so it belongs in the idle start and never in a draw.
   */
  build(image: HTMLImageElement): void
  /** True where a point in normalized art coordinates is water. */
  isWaterPixel(nx: number, ny: number): boolean
  /** The mask to composite, or null until a build has succeeded. */
  mask(): HTMLCanvasElement | null
  dispose(): void
}

/** The water, holding nothing until it is built. */
export function createWater(): Water {
  let samples: Uint8ClampedArray | null = null
  let maskCanvas: HTMLCanvasElement | null = null

  return {
    build(image: HTMLImageElement): void {
      // An image that never decoded draws nothing, which would leave the
      // samples empty and every point reading as dry: the pond would go dead
      // rather than fall back. Holding the build off keeps the answer below,
      // which is the pond's shape alone.
      if (!image.naturalWidth || !image.naturalHeight) return

      // Both draws stretch the art onto the grid rather than fitting it, so
      // the grid holds the whole frame whatever shape the art is. The art the
      // page ships is 1536 by 1024 and the grid is the same 3 to 2, which
      // makes this an exact 4 to 1 reduction.
      const sampler = document.createElement('canvas')
      sampler.width = SAMPLE_WIDTH
      sampler.height = SAMPLE_HEIGHT

      // Both canvases exist to be read back pixel by pixel, which is what the
      // hint tells the browser: keep them where a read is cheap.
      const read = sampler.getContext('2d', { willReadFrequently: true })
      if (!read) return

      read.clearRect(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT)
      read.drawImage(image, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT)
      // The whole grid is read once and kept. A pointer event asking the
      // canvas for one pixel instead would stall the pointer on a readback.
      samples = read.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT).data

      const canvas = document.createElement('canvas')
      canvas.width = SAMPLE_WIDTH
      canvas.height = SAMPLE_HEIGHT

      const cut = canvas.getContext('2d', { willReadFrequently: true })
      if (!cut) return

      cut.clearRect(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT)
      cut.save()
      cut.clip(pondClip(SAMPLE_WIDTH, SAMPLE_HEIGHT))
      cut.drawImage(image, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT)
      cut.restore()

      const cutout = cut.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT)
      const pixels = cutout.data

      // The mask is white everywhere and carries its shape in alpha alone,
      // because `destination-in` reads nothing else.
      for (let index = 0; index < pixels.length; index += 4) {
        const alpha = maskAlpha(
          pixels[index],
          pixels[index + 1],
          pixels[index + 2],
          pixels[index + 3],
        )

        pixels[index] = 255
        pixels[index + 1] = 255
        pixels[index + 2] = 255
        pixels[index + 3] = alpha
      }

      cut.putImageData(cutout, 0, 0)
      maskCanvas = canvas
    },

    isWaterPixel(nx: number, ny: number): boolean {
      if (!pointInPond(nx, ny)) return false
      // Before the samples exist the pond's shape is the whole answer, which
      // is the generous one: a ripple on the pond is better than no ripple.
      if (!samples) return true

      const x = Math.max(
        0,
        Math.min(SAMPLE_WIDTH - 1, Math.round(nx * SAMPLE_WIDTH)),
      )
      const y = Math.max(
        0,
        Math.min(SAMPLE_HEIGHT - 1, Math.round(ny * SAMPLE_HEIGHT)),
      )
      const index = (y * SAMPLE_WIDTH + x) * 4

      return isWaterColor(
        samples[index],
        samples[index + 1],
        samples[index + 2],
        samples[index + 3],
      )
    },

    mask(): HTMLCanvasElement | null {
      return maskCanvas
    },

    dispose(): void {
      samples = null
      maskCanvas = null
    },
  }
}

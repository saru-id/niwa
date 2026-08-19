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

/**
 * The pond's edge, as fractions of the art's width and height.
 *
 * Traced on the art by hand, and the shape is the whole job: it has to take in
 * every stretch of water and leave out every rock, and no formula does both.
 * The first pass enclosed under half the water, so the dark left side of the
 * pond and the lobe below the fountain were dry to a pointer — a ripple that
 * refuses to start where there is plainly water. Widening it to a blob was
 * worse and the suite said so: it swallowed the boulders, and stone that
 * ripples is a bigger lie than water that does not.
 *
 * So it is concave, and the concavities are load-bearing. It runs behind the
 * boulders on the left, between the stones stepping across on the right, and
 * around the shore at the foot. The one thing it does cover is the sunken
 * stone at its foot, where the colour reading below is the only guard left —
 * `water.test.ts` holds that stone to a measured bound.
 */
const POND: readonly (readonly [number, number])[] = [
  [0.407, 0.583],
  [0.413, 0.544],
  [0.455, 0.548],
  [0.501, 0.545],
  [0.501, 0.559],
  [0.528, 0.571],
  [0.555, 0.58],
  [0.554, 0.595],
  [0.57, 0.609],
  [0.601, 0.618],
  [0.627, 0.621],
  [0.622, 0.639],
  [0.627, 0.668],
  [0.673, 0.685],
  [0.703, 0.693],
  [0.702, 0.719],
  [0.722, 0.74],
  [0.698, 0.757],
  [0.684, 0.771],
  [0.664, 0.769],
  [0.653, 0.775],
  [0.641, 0.781],
  [0.627, 0.792],
  [0.617, 0.807],
  [0.599, 0.828],
  [0.583, 0.87],
  [0.555, 0.875],
  [0.53, 0.89],
  [0.49, 0.93],
  [0.432, 0.936],
  [0.417, 0.912],
  [0.374, 0.924],
  [0.346, 0.923],
  [0.305, 0.897],
  [0.261, 0.884],
  [0.267, 0.854],
  [0.283, 0.83],
  [0.278, 0.792],
  [0.309, 0.778],
  [0.333, 0.76],
  [0.332, 0.735],
  [0.326, 0.705],
  [0.317, 0.679],
  [0.306, 0.663],
  [0.3, 0.644],
  [0.327, 0.649],
  [0.351, 0.644],
  [0.373, 0.629],
  [0.376, 0.606],
  [0.395, 0.602],
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

  path.moveTo(width * 0.407, height * 0.583)
  path.bezierCurveTo(
    width * 0.41,
    height * 0.5733,
    width * 0.405,
    height * 0.5498,
    width * 0.413,
    height * 0.544,
  )
  path.bezierCurveTo(
    width * 0.421,
    height * 0.5382,
    width * 0.4403,
    height * 0.5478,
    width * 0.455,
    height * 0.548,
  )
  path.bezierCurveTo(
    width * 0.4697,
    height * 0.5482,
    width * 0.4933,
    height * 0.5432,
    width * 0.501,
    height * 0.545,
  )
  path.bezierCurveTo(
    width * 0.5087,
    height * 0.5468,
    width * 0.4965,
    height * 0.5547,
    width * 0.501,
    height * 0.559,
  )
  path.bezierCurveTo(
    width * 0.5055,
    height * 0.5633,
    width * 0.519,
    height * 0.5675,
    width * 0.528,
    height * 0.571,
  )
  path.bezierCurveTo(
    width * 0.537,
    height * 0.5745,
    width * 0.5507,
    height * 0.576,
    width * 0.555,
    height * 0.58,
  )
  path.bezierCurveTo(
    width * 0.5593,
    height * 0.584,
    width * 0.5515,
    height * 0.5902,
    width * 0.554,
    height * 0.595,
  )
  path.bezierCurveTo(
    width * 0.5565,
    height * 0.5998,
    width * 0.5622,
    height * 0.6052,
    width * 0.57,
    height * 0.609,
  )
  path.bezierCurveTo(
    width * 0.5778,
    height * 0.6128,
    width * 0.5915,
    height * 0.616,
    width * 0.601,
    height * 0.618,
  )
  path.bezierCurveTo(
    width * 0.6105,
    height * 0.62,
    width * 0.6235,
    height * 0.6175,
    width * 0.627,
    height * 0.621,
  )
  path.bezierCurveTo(
    width * 0.6305,
    height * 0.6245,
    width * 0.622,
    height * 0.6312,
    width * 0.622,
    height * 0.639,
  )
  path.bezierCurveTo(
    width * 0.622,
    height * 0.6468,
    width * 0.6185,
    height * 0.6603,
    width * 0.627,
    height * 0.668,
  )
  path.bezierCurveTo(
    width * 0.6355,
    height * 0.6757,
    width * 0.6603,
    height * 0.6808,
    width * 0.673,
    height * 0.685,
  )
  path.bezierCurveTo(
    width * 0.6857,
    height * 0.6892,
    width * 0.6982,
    height * 0.6873,
    width * 0.703,
    height * 0.693,
  )
  path.bezierCurveTo(
    width * 0.7078,
    height * 0.6987,
    width * 0.6988,
    height * 0.7112,
    width * 0.702,
    height * 0.719,
  )
  path.bezierCurveTo(
    width * 0.7052,
    height * 0.7268,
    width * 0.7227,
    height * 0.7337,
    width * 0.722,
    height * 0.74,
  )
  path.bezierCurveTo(
    width * 0.7213,
    height * 0.7463,
    width * 0.7043,
    height * 0.7518,
    width * 0.698,
    height * 0.757,
  )
  path.bezierCurveTo(
    width * 0.6917,
    height * 0.7622,
    width * 0.6897,
    height * 0.769,
    width * 0.684,
    height * 0.771,
  )
  path.bezierCurveTo(
    width * 0.6783,
    height * 0.773,
    width * 0.6692,
    height * 0.7683,
    width * 0.664,
    height * 0.769,
  )
  path.bezierCurveTo(
    width * 0.6588,
    height * 0.7697,
    width * 0.6568,
    height * 0.773,
    width * 0.653,
    height * 0.775,
  )
  path.bezierCurveTo(
    width * 0.6492,
    height * 0.777,
    width * 0.6453,
    height * 0.7782,
    width * 0.641,
    height * 0.781,
  )
  path.bezierCurveTo(
    width * 0.6367,
    height * 0.7838,
    width * 0.631,
    height * 0.7877,
    width * 0.627,
    height * 0.792,
  )
  path.bezierCurveTo(
    width * 0.623,
    height * 0.7963,
    width * 0.6217,
    height * 0.801,
    width * 0.617,
    height * 0.807,
  )
  path.bezierCurveTo(
    width * 0.6123,
    height * 0.813,
    width * 0.6047,
    height * 0.8175,
    width * 0.599,
    height * 0.828,
  )
  path.bezierCurveTo(
    width * 0.5933,
    height * 0.8385,
    width * 0.5903,
    height * 0.8622,
    width * 0.583,
    height * 0.87,
  )
  path.bezierCurveTo(
    width * 0.5757,
    height * 0.8778,
    width * 0.5638,
    height * 0.8717,
    width * 0.555,
    height * 0.875,
  )
  path.bezierCurveTo(
    width * 0.5462,
    height * 0.8783,
    width * 0.5408,
    height * 0.8808,
    width * 0.53,
    height * 0.89,
  )
  path.bezierCurveTo(
    width * 0.5192,
    height * 0.8992,
    width * 0.5063,
    height * 0.9223,
    width * 0.49,
    height * 0.93,
  )
  path.bezierCurveTo(
    width * 0.4737,
    height * 0.9377,
    width * 0.4442,
    height * 0.939,
    width * 0.432,
    height * 0.936,
  )
  path.bezierCurveTo(
    width * 0.4198,
    height * 0.933,
    width * 0.4267,
    height * 0.914,
    width * 0.417,
    height * 0.912,
  )
  path.bezierCurveTo(
    width * 0.4073,
    height * 0.91,
    width * 0.3858,
    height * 0.9222,
    width * 0.374,
    height * 0.924,
  )
  path.bezierCurveTo(
    width * 0.3622,
    height * 0.9258,
    width * 0.3575,
    height * 0.9275,
    width * 0.346,
    height * 0.923,
  )
  path.bezierCurveTo(
    width * 0.3345,
    height * 0.9185,
    width * 0.3192,
    height * 0.9035,
    width * 0.305,
    height * 0.897,
  )
  path.bezierCurveTo(
    width * 0.2908,
    height * 0.8905,
    width * 0.2673,
    height * 0.8912,
    width * 0.261,
    height * 0.884,
  )
  path.bezierCurveTo(
    width * 0.2547,
    height * 0.8768,
    width * 0.2633,
    height * 0.863,
    width * 0.267,
    height * 0.854,
  )
  path.bezierCurveTo(
    width * 0.2707,
    height * 0.845,
    width * 0.2812,
    height * 0.8403,
    width * 0.283,
    height * 0.83,
  )
  path.bezierCurveTo(
    width * 0.2848,
    height * 0.8197,
    width * 0.2737,
    height * 0.8007,
    width * 0.278,
    height * 0.792,
  )
  path.bezierCurveTo(
    width * 0.2823,
    height * 0.7833,
    width * 0.2998,
    height * 0.7833,
    width * 0.309,
    height * 0.778,
  )
  path.bezierCurveTo(
    width * 0.3182,
    height * 0.7727,
    width * 0.3292,
    height * 0.7672,
    width * 0.333,
    height * 0.76,
  )
  path.bezierCurveTo(
    width * 0.3368,
    height * 0.7528,
    width * 0.3332,
    height * 0.7442,
    width * 0.332,
    height * 0.735,
  )
  path.bezierCurveTo(
    width * 0.3308,
    height * 0.7258,
    width * 0.3285,
    height * 0.7143,
    width * 0.326,
    height * 0.705,
  )
  path.bezierCurveTo(
    width * 0.3235,
    height * 0.6957,
    width * 0.3203,
    height * 0.686,
    width * 0.317,
    height * 0.679,
  )
  path.bezierCurveTo(
    width * 0.3137,
    height * 0.672,
    width * 0.3088,
    height * 0.6688,
    width * 0.306,
    height * 0.663,
  )
  path.bezierCurveTo(
    width * 0.3032,
    height * 0.6572,
    width * 0.2965,
    height * 0.6463,
    width * 0.3,
    height * 0.644,
  )
  path.bezierCurveTo(
    width * 0.3035,
    height * 0.6417,
    width * 0.3185,
    height * 0.649,
    width * 0.327,
    height * 0.649,
  )
  path.bezierCurveTo(
    width * 0.3355,
    height * 0.649,
    width * 0.3433,
    height * 0.6473,
    width * 0.351,
    height * 0.644,
  )
  path.bezierCurveTo(
    width * 0.3587,
    height * 0.6407,
    width * 0.3688,
    height * 0.6353,
    width * 0.373,
    height * 0.629,
  )
  path.bezierCurveTo(
    width * 0.3772,
    height * 0.6227,
    width * 0.3723,
    height * 0.6105,
    width * 0.376,
    height * 0.606,
  )
  path.bezierCurveTo(
    width * 0.3797,
    height * 0.6015,
    width * 0.3898,
    height * 0.6058,
    width * 0.395,
    height * 0.602,
  )
  path.bezierCurveTo(
    width * 0.4002,
    height * 0.5982,
    width * 0.404,
    height * 0.5927,
    width * 0.407,
    height * 0.583,
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

/**
 * Which samples the water has closed around, on a grid of mask alphas.
 *
 * A colour test asks one pixel one question, and there are things on a pond
 * that are not the colour of water: the koi, the lily pads, the sky caught on
 * the surface. Each of them reads as dry, and a ring crossing one comes out
 * the far side with a bite taken out of it — which is the pond saying the fish
 * is a hole in the water rather than a fish in it.
 *
 * The shape answers what the colour cannot: anything the water entirely
 * surrounds is water, whatever colour it happens to be. The walk starts at the
 * grid's edge and floods through everything dry, so every dry sample it never
 * reaches is one the water has closed around.
 *
 * What this deliberately does not do is fill the pond's own rim. Stone that
 * breaks the shoreline stays connected to the dry world outside and is left
 * alone, and that is the whole reason the rule is stated as enclosure rather
 * than as "everything inside the outline": the sunken stone at the pond's foot
 * touches its edge, so a ripple still stops at it, while the fish two thirds
 * of the way out does not.
 */
export function enclosedByWater(
  alphas: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const dry = new Uint8Array(width * height)
  const stack = new Int32Array(width * height)
  let top = 0

  const open = (index: number): void => {
    if (alphas[index] !== 0 || dry[index] === 1) return
    dry[index] = 1
    stack[top] = index
    top += 1
  }

  for (let x = 0; x < width; x += 1) {
    open(x)
    open((height - 1) * width + x)
  }
  for (let y = 0; y < height; y += 1) {
    open(y * width)
    open(y * width + width - 1)
  }

  while (top > 0) {
    top -= 1
    const index = stack[top]
    const x = index % width
    const y = (index - x) / width

    if (x > 0) open(index - 1)
    if (x < width - 1) open(index + 1)
    if (y > 0) open(index - width)
    if (y < height - 1) open(index + width)
  }

  const enclosed = new Uint8Array(width * height)
  for (let index = 0; index < enclosed.length; index += 1) {
    if (alphas[index] === 0 && dry[index] === 0) enclosed[index] = 1
  }

  return enclosed
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
  // What the water closed around, kept so the pointer answers the same way
  // the mask does. A reader whose ring is drawn over the koi has to be able to
  // strike one there in the first place.
  let enclosed: Uint8Array | null = null

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

      // The colour reading first, into a grid of its own: the shape question
      // below needs every answer before it can ask which of them the water
      // has surrounded.
      const alphas = new Uint8Array(SAMPLE_WIDTH * SAMPLE_HEIGHT)

      for (let index = 0; index < alphas.length; index += 1) {
        const at = index * 4
        alphas[index] = maskAlpha(
          pixels[at],
          pixels[at + 1],
          pixels[at + 2],
          pixels[at + 3],
        )
      }

      enclosed = enclosedByWater(alphas, SAMPLE_WIDTH, SAMPLE_HEIGHT)

      // The mask is white everywhere and carries its shape in alpha alone,
      // because `destination-in` reads nothing else. A sample the water closed
      // around takes full alpha: it is not an edge, so it needs none of the
      // ramp the edge gets.
      for (let index = 0; index < alphas.length; index += 1) {
        const at = index * 4

        pixels[at] = 255
        pixels[at + 1] = 255
        pixels[at + 2] = 255
        pixels[at + 3] = enclosed[index] === 1 ? 255 : alphas[index]
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

      if (enclosed !== null && enclosed[y * SAMPLE_WIDTH + x] === 1) return true

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
      enclosed = null
    },
  }
}

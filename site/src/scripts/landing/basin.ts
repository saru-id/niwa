/* The basin: the water the fall runs into, simulated over the still art.
 *
 * The art paints a stone bowl with a thin ellipse of water in it. This module
 * lays a height field over that ellipse. A drip presses the surface down, each
 * step spreads the dent outwards, and the render samples the art through the
 * surface's own slope: where the water tilts, the pixel under it moves. A
 * glint sits where the fall lands.
 *
 * The field is a fixed grid. It stands for the water, not for the pixels on
 * the screen, so a large display gets a larger overlay and the same
 * simulation. Everything that places that overlay is a fraction of the art's
 * frame, so the water lands on the same stone in either composition.
 *
 * The exported fractions are calibration. Each one answers to a detail in the
 * art, and moving one moves the water off the bowl.
 *
 * The entry decides when this draws: while the hero is visible and motion is
 * not reduced, on a phone as well as a desktop. The answer `draw` returns
 * covers the water alone.
 */

import type { Effect, Rect } from './geometry'

/** Where the water sits on the art, as a fraction of the art's frame. */
export const BASIN_CENTER = { x: 0.7129, y: 0.462 } as const

/**
 * How far the moving water sits off that center, in the same fractions.
 *
 * The art paints the surface a little to the left of the bowl's middle and a
 * little below it. The overlay follows the paint.
 */
export const OVERLAY_OFFSET = { x: -0.0079, y: 0.0049 } as const

/**
 * The water's half width and half height, as fractions of the frame.
 *
 * The surface is a flat ellipse because the art looks across the bowl rather
 * than down into it.
 */
export const BASIN_RADIUS = { x: 0.0463, y: 0.0145 } as const

/**
 * Where the fall lands, as a place inside the water: 0 to 1 across the
 * ellipse on the art, and the same 0 to 1 across the field's grid.
 *
 * The simulation and the glint both read it, so the dent and the highlight
 * cannot drift apart.
 */
export const IMPACT = { x: 0.635, y: 0.58 } as const

/**
 * The bowl's tilt on the art, in radians.
 *
 * The clip and the glint are two ellipses on one rim. They read this value
 * rather than two copies of it, because a rim cannot be at two angles.
 */
export const BASIN_ROTATION = -0.018

/** The end angle that closes an ellipse. */
const TURN = Math.PI * 2

/**
 * The patch of art the water shows, as fractions of the art's own pixels:
 * the surface inside the bowl, and none of the stone around it.
 *
 * These are the one place the natural raster is read, so they answer to the
 * art's pixels rather than to the frame the rest of this module measures in.
 */
export const BASIN_SOURCE = {
  left: 0.6609,
  top: 0.4445,
  width: 0.104,
  height: 0.035,
} as const

/**
 * The field's grid.
 *
 * It measures the water, not the screen, so it does not grow with the page:
 * the paint scales it to the frame on the way out. Eighty cells across
 * resolve the ripples a bowl this size shows.
 */
const FIELD_WIDTH = 80
const FIELD_HEIGHT = 80

/**
 * How much of the field's half width the water fills.
 *
 * The cells outside it stay dry. The render fades the water out over them, so
 * the surface meets the stone without an edge.
 */
const MASK_RADIUS = 0.49

/**
 * A cell's distance from the middle of the field, as a fraction of the
 * water's radius: 1 at the rim.
 */
const normalize = (index: number, span: number) => (index / (span - 1) - 0.5) / MASK_RADIUS

/** The surface: one shape, and three heights for every cell in it. */
export interface WaveField {
  readonly width: number
  readonly height: number
  /** 1 where the cell holds water, 0 outside the ellipse. */
  readonly mask: Uint8Array
  /** The surface now, one step back, and the one being written. */
  current: Float32Array
  previous: Float32Array
  next: Float32Array
}

/** A field on the given grid, at rest. */
export function createField(width: number, height: number): WaveField {
  const size = width * height
  const mask = new Uint8Array(size)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const normalizedX = normalize(x, width)
      const normalizedY = normalize(y, height)
      mask[y * width + x] = normalizedX ** 2 + normalizedY ** 2 <= 1 ? 1 : 0
    }
  }

  return {
    width,
    height,
    mask,
    current: new Float32Array(size),
    previous: new Float32Array(size),
    next: new Float32Array(size),
  }
}

/**
 * How hard the fall presses the surface at one moment.
 *
 * The water is never still, because the fall never stops. Raising a sine to a
 * high power leaves a curve that sits near nothing and spikes near its peak.
 * That is the shape a drip has. Two of them at rates that do not divide keep
 * the drips off a beat a reader could count. The slow last term is the fall's
 * own weight moving. The answer is always negative: a drop presses down.
 */
export function drive(driveTime: number): number {
  const primary = ((Math.sin(driveTime * 0.0264) + 1) * 0.5) ** 10
  const secondary = ((Math.sin(driveTime * 0.04 + 1.8) + 1) * 0.5) ** 14

  return -0.1 - primary * 0.4 - secondary * 0.16 - Math.sin(driveTime * 0.011 + 0.6) * 0.027
}

/**
 * One fixed step of the surface.
 *
 * Every cell reads its four neighbours and its own height one step back. A dry
 * neighbour reads as the cell itself, which turns the wave back at the rim
 * instead of letting it drain. The drip lands last, on the surface the step
 * just produced, and then the three buffers rotate.
 *
 * `driveTime` is the moment this step lands on, which is not the moment the
 * frame started: a frame that owes several steps walks the time forward with
 * them.
 */
export function stepField(field: WaveField, driveTime: number): void {
  const { width, height, mask, current, previous, next } = field

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x
      if (!mask[index]) {
        next[index] = 0
        continue
      }

      const center = current[index]
      const left = mask[index - 1] ? current[index - 1] : center
      const right = mask[index + 1] ? current[index + 1] : center
      const above = mask[index - width] ? current[index - width] : center
      const below = mask[index + width] ? current[index + width] : center
      const laplacian = left + right + above + below - center * 4
      // 0.225 is the wave's speed on this grid. A step like this one grows
      // without bound past a half, so the speed stays well under it. 0.987
      // takes back a little over one percent a step, so a ripple crosses the
      // bowl a few times and then rests.
      const raised = (center * 2 - previous[index] + laplacian * 0.225) * 0.987

      // The clamp bounds the height. The water's own range is a small
      // fraction of it, so it only catches a step that has gone wrong.
      next[index] = Math.max(-1.4, Math.min(1.4, raised))
    }
  }

  const impactX = Math.round((width - 1) * IMPACT.x)
  const impactY = Math.round((height - 1) * IMPACT.y)
  const press = drive(driveTime)

  // The drip presses a small round dent rather than one cell, because a point
  // source on a grid rings at the grid's own spacing. The surface moves about
  // a quarter of the way to the press each step, so a drip arrives over
  // several steps instead of in one.
  for (let offsetY = -2; offsetY <= 2; offsetY += 1) {
    for (let offsetX = -2; offsetX <= 2; offsetX += 1) {
      const distanceSquared = offsetX ** 2 + offsetY ** 2
      if (distanceSquared > 5) continue

      const index = (impactY + offsetY) * width + impactX + offsetX
      if (!mask[index]) continue

      const target = press * Math.exp(-distanceSquared * 0.58)
      next[index] += (target - next[index]) * 0.26
    }
  }

  field.previous = current
  field.current = next
  field.next = previous
}

/**
 * The water's pixels, read from the art through the surface.
 *
 * Every cell takes its own slope, moves the sample by it, and mixes the four
 * source pixels around where that lands. Still water has no slope and no
 * height, so it reads the source straight through and shows the stone as the
 * art painted it. The same slope decides the shading, which is why a tilt
 * towards the light reads brighter than the pixel it samples.
 *
 * The numbers in the loop are tuning, calibration like the fractions above:
 * they set how far the water bends what it shows and how hard its slopes
 * catch the light.
 */
export function refract(
  field: WaveField,
  source: Uint8ClampedArray,
  target: Uint8ClampedArray,
): void {
  const { width, height, mask, current } = field

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x
      const pixel = index * 4

      if (!mask[index]) {
        target[pixel + 3] = 0
        continue
      }

      const center = current[index]
      const left = mask[index - 1] ? current[index - 1] : center
      const right = mask[index + 1] ? current[index + 1] : center
      const above = mask[index - width] ? current[index - width] : center
      const below = mask[index + width] ? current[index + width] : center
      const gradientX = (right - left) * 0.5
      const gradientY = (below - above) * 0.5
      const sampleX = Math.max(0, Math.min(width - 1, x + gradientX * 82 + center * 3))
      const sampleY = Math.max(0, Math.min(height - 1, y + gradientY * 82 + center * 3))
      const x0 = Math.floor(sampleX)
      const y0 = Math.floor(sampleY)
      const x1 = Math.min(width - 1, x0 + 1)
      const y1 = Math.min(height - 1, y0 + 1)
      const mixX = sampleX - x0
      const mixY = sampleY - y0
      const topLeft = (y0 * width + x0) * 4
      const topRight = (y0 * width + x1) * 4
      const bottomLeft = (y1 * width + x0) * 4
      const bottomRight = (y1 * width + x1) * 4
      const light = -gradientX * 0.74 - gradientY * 0.5
      const brightness = Math.max(
        -31,
        Math.min(47, Math.sign(light) * Math.sqrt(Math.abs(light)) * 158),
      )
      const edge = Math.min(
        1,
        Math.max(0, (1 - normalize(x, width) ** 2 - normalize(y, height) ** 2) * 8),
      )

      for (let channel = 0; channel < 3; channel += 1) {
        const top =
          source[topLeft + channel] * (1 - mixX) + source[topRight + channel] * mixX
        const bottom =
          source[bottomLeft + channel] * (1 - mixX) + source[bottomRight + channel] * mixX
        // Blue takes the light whole, green a little less and red less again,
        // so a lit slope reads cool the way water does.
        const tint =
          channel === 1 ? brightness * 0.92 : channel === 2 ? brightness : brightness * 0.72
        const refracted = top * (1 - mixY) + bottom * mixY

        target[pixel + channel] = Math.max(0, Math.min(255, refracted + tint))
      }

      // The water is not quite opaque, so a little of the stone under it
      // shows even at the middle.
      target[pixel + 3] = Math.round(edge * 246)
    }
  }
}

/**
 * The glint's strength at one moment.
 *
 * The point where the fall lands catches the sky. Two rates again, so the
 * flicker never settles, and a floor so the point never goes out.
 */
export function glintAlpha(now: number): number {
  return 0.2 + ((Math.sin(now * 0.019) + Math.sin(now * 0.043 + 0.8) + 2) / 4) * 0.18
}

/**
 * An ellipse lying on the bowl's rim.
 *
 * The clip and the glint are both drawn through here. The rim's angle appears
 * once, so the two cannot end up at different angles.
 */
const rim = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radiusX: number,
  radiusY: number,
) => {
  context.beginPath()
  context.ellipse(x, y, radiusX, radiusY, BASIN_ROTATION, 0, TURN)
}

/**
 * The water on the canvas, for one frame.
 *
 * `frame` is where the art's pixels sit, and every place below is a fraction
 * of it. The clip is the water's own ellipse, so the field never paints onto
 * the stone, and the wave image fills exactly the box that ellipse bounds.
 * The glint goes on last and outside the clip, because a highlight on water
 * sits on top of what the water shows.
 */
export function paintBasin(
  context: CanvasRenderingContext2D,
  frame: Rect,
  wave: CanvasImageSource,
  now: number,
): void {
  const centerX = frame.left + frame.width * BASIN_CENTER.x
  const centerY = frame.top + frame.height * BASIN_CENTER.y
  const overlayX = centerX + frame.width * OVERLAY_OFFSET.x
  const overlayY = centerY + frame.height * OVERLAY_OFFSET.y
  const radiusX = frame.width * BASIN_RADIUS.x
  const radiusY = frame.height * BASIN_RADIUS.y

  context.save()
  rim(context, overlayX, overlayY, radiusX, radiusY)
  context.clip()
  // The field is eighty cells across and the water is a few dozen pixels
  // wide, so the scale up has to interpolate or the surface reads as blocks.
  context.imageSmoothingEnabled = true
  context.drawImage(wave, overlayX - radiusX, overlayY - radiusY, radiusX * 2, radiusY * 2)
  context.restore()

  context.save()
  context.globalCompositeOperation = 'screen'
  context.fillStyle = `rgba(222, 244, 234, ${glintAlpha(now)})`
  // The glint is a highlight a couple of pixels across, and it keeps that
  // size on every screen: where the fall lands is a point at any scale.
  rim(
    context,
    overlayX + (IMPACT.x - 0.5) * radiusX * 2,
    overlayY + (IMPACT.y - 0.5) * radiusY * 2,
    1.7,
    0.65,
  )
  context.fill()
  context.restore()
}

/** Everything `init` builds. They arrive together or not at all. */
interface Buffers {
  field: WaveField
  canvas: HTMLCanvasElement
  context: CanvasRenderingContext2D
  image: ImageData
  source: Uint8ClampedArray
}

/**
 * The basin, as the scene draws it.
 *
 * Nothing exists until `init` runs: the canvases, the buffers and the source
 * pixels are all built there, from an image the entry has already decoded.
 * The art's own raster is read once, in that call and nowhere else.
 */
export function createBasin(): Effect {
  let buffers: Buffers | undefined
  let lastTime = 0
  let lag = 0

  return {
    init(image) {
      const naturalWidth = image.naturalWidth
      const naturalHeight = image.naturalHeight
      if (naturalWidth === 0 || naturalHeight === 0) return

      // The sampling canvas is local. It exists to be read once, and what the
      // water draws from is the pixels, not the canvas.
      const sampler = document.createElement('canvas')
      sampler.width = FIELD_WIDTH
      sampler.height = FIELD_HEIGHT
      const samplerContext = sampler.getContext('2d', { willReadFrequently: true })
      const canvas = document.createElement('canvas')
      canvas.width = FIELD_WIDTH
      canvas.height = FIELD_HEIGHT
      const context = canvas.getContext('2d')
      if (samplerContext === null || context === null) return

      samplerContext.drawImage(
        image,
        naturalWidth * BASIN_SOURCE.left,
        naturalHeight * BASIN_SOURCE.top,
        naturalWidth * BASIN_SOURCE.width,
        naturalHeight * BASIN_SOURCE.height,
        0,
        0,
        FIELD_WIDTH,
        FIELD_HEIGHT,
      )

      buffers = {
        field: createField(FIELD_WIDTH, FIELD_HEIGHT),
        canvas,
        context,
        image: context.createImageData(FIELD_WIDTH, FIELD_HEIGHT),
        source: samplerContext.getImageData(0, 0, FIELD_WIDTH, FIELD_HEIGHT).data,
      }
    },

    // The field is a grid in the water's own measure, so a resize changes only
    // where the paint puts it, and every frame reads that from its scene.
    resize() {},

    draw(context, scene, now) {
      if (buffers === undefined) return false

      const step = 1000 / 60
      if (lastTime === 0) lastTime = now
      // A tab that was hidden comes back owing minutes. Fifty milliseconds is
      // the most debt one frame takes on and three steps the most it pays:
      // past that the catching up costs more than the frame it catches up to.
      lag += Math.min(50, now - lastTime)
      lastTime = now

      let steps = 0
      while (lag >= step && steps < 3) {
        stepField(buffers.field, now - lag + step)
        lag -= step
        steps += 1
      }

      refract(buffers.field, buffers.source, buffers.image.data)
      buffers.context.putImageData(buffers.image, 0, 0)
      paintBasin(context, scene.frame, buffers.canvas, now)

      // The fall never stops, so the water never rests.
      return true
    },

    // The water answers the fall, not the reader.
    pointer() {},

    dispose() {
      buffers = undefined
      lastTime = 0
      lag = 0
    },
  }
}

/* The rings a pointer leaves on the pond.
 *
 * A pointer crossing the water strikes rings that open and fade. This module
 * owns the pool they live in, ages them against the clock the entry passes to
 * the draw, and paints them inside the pond's own curve.
 *
 * The pass ends by compositing the water mask over the whole canvas with
 * `destination-in`, which erases every pixel outside the water. The erase is
 * canvas wide and takes anything already drawn with it, which is why this
 * effect draws first and every later one paints onto the masked canvas.
 *
 * Rings are held in normalized art coordinates rather than canvas pixels. The
 * art wrap is sticky and resizes with the page, and a ring pinned to a canvas
 * pixel would slide off the water it was struck on.
 */

import type { Effect, Scene } from './geometry'
import { createWater, pondClip } from './water'

// A pointer reports far faster than the water can answer, so two throttles
// stand between the events and the pool: 95 milliseconds between rings, and
// 12 canvas pixels between one ring and the next. Under either, the rings
// stack into a wash instead of reading as separate strikes.
const SPAWN_GAP = 95
const SPAWN_STEP = 12

// Every ring costs two strokes a frame, so the pool is bounded. A pointer can
// raise about eleven rings inside one ring's life at the gap above, so 14
// trims a runaway without ever trimming the effect.
const POOL_LIMIT = 14

// A ring lives between 940 and 1130 milliseconds and opens from 5 canvas
// pixels to between 43 and 61 of them. Both carry a spread, so two strikes in
// the same place do not move as one.
const LIFE = 940
const LIFE_SPREAD = 190
const REACH = 38
const REACH_SPREAD = 18

/** A press is a firmer strike than a pass over the water. */
const MOVE_STRENGTH = 0.8
const PRESS_STRENGTH = 1.25

// The two rings a strike draws. The front one carries it, at nearly full
// strength and wide enough to hold its line over moving water. The second
// trails 8 pixels back at under half the strength and a little over half the
// width: enough to read as one ring following another, too little to double
// the mark's weight.
const TRAILS = [
  { behind: 0, alpha: 0.9, width: 1.65 },
  { behind: 8, alpha: 0.42, width: 0.95 },
]

/** One ring, from the strike that raised it to the moment it is dropped. */
interface Ripple {
  /** Where it was struck, as a fraction of the art frame. */
  nx: number
  ny: number
  strength: number
  createdAt: number
  duration: number
  /** How far it opens past its start, in canvas pixels. */
  reach: number
}

/** The pond's ripples, holding nothing until the factory runs. */
export function createRipples(): Effect {
  const pool: Ripple[] = []
  const water = createWater()
  let measured: Scene | null = null
  let spawnedAt = 0
  let chain: { x: number; y: number } | null = null

  // The throttle reads `performance.now()` while the draw reads the timestamp
  // the entry hands it. Both clocks are the page's own: an animation frame's
  // timestamp and `performance.now()` share one time origin, so a ring's age
  // is the same number either way.
  const strike = (nx: number, ny: number, strength: number): void => {
    // The step throttle measures in canvas pixels, and there is no canvas box
    // to measure in until the scene has been taken.
    if (!measured) return

    const { frame } = measured
    const x = nx * frame.width
    const y = ny * frame.height
    const step = chain ? Math.hypot(x - chain.x, y - chain.y) : Infinity
    const now = performance.now()

    if (now - spawnedAt < SPAWN_GAP || step < SPAWN_STEP) return

    spawnedAt = now
    chain = { x, y }
    pool.push({
      nx,
      ny,
      strength,
      createdAt: now,
      duration: LIFE + Math.random() * LIFE_SPREAD,
      reach: REACH + Math.random() * REACH_SPREAD,
    })

    if (pool.length > POOL_LIMIT) pool.shift()
  }

  return {
    init(image: HTMLImageElement, scene: Scene): void {
      measured = scene
      water.build(image)
    },

    resize(scene: Scene): void {
      // The mask is built on a fixed grid and drawn onto the frame, so a new
      // size costs it nothing. The rings in flight are the cost. A resize
      // reallocates the backing store, and the first frame into a fresh one
      // rasterizes every ring that survived, each clipped to the pond and
      // followed by the closing composite, into pixels that have never been
      // touched. A ring lives about a second and a resize is rarer than that,
      // so the rings end with the size they were struck at. They would draw
      // wrong in the new one regardless: a ring's reach and its start are
      // canvas pixels, and only its center is a fraction of the frame.
      pool.length = 0
      chain = null
      measured = scene
    },

    draw(context: CanvasRenderingContext2D, scene: Scene, now: number): boolean {
      while (pool.length > 0 && now - pool[0].createdAt > pool[0].duration) {
        pool.shift()
      }

      if (pool.length === 0) return false

      const { frame } = scene

      context.save()
      context.translate(frame.left, frame.top)
      context.clip(pondClip(frame.width, frame.height))

      for (const ripple of pool) {
        const progress = Math.min(1, (now - ripple.createdAt) / ripple.duration)
        // The fade runs on a 1.7 power so most of it happens late: the ring
        // reads as spreading out rather than as dimming in place.
        const fade = Math.pow(1 - progress, 1.7) * ripple.strength
        // The 5 pixels a ring starts at are what put the strike on the frame
        // it happens: a ring opening from nothing spends its first frames too
        // small to see.
        const radius = 5 + progress * ripple.reach
        // A ring lies on the water, so it is drawn flattened. It flattens
        // less further down the art, where the surface is nearer the eye and
        // seen less edge on.
        const squash = 0.2 + ripple.ny * 0.11
        const x = ripple.nx * frame.width
        const y = ripple.ny * frame.height

        for (const trail of TRAILS) {
          const ring = radius - trail.behind

          if (ring <= 0) continue

          context.beginPath()
          // The tilt is the pond's own in the art, about two degrees.
          context.ellipse(x, y, ring, ring * squash, -0.035, 0, Math.PI * 2)
          // Pale blue green, lighter than any water it is drawn over.
          context.strokeStyle = `rgba(183, 231, 225, ${fade * trail.alpha})`
          context.lineWidth = trail.width
          context.stroke()
        }
      }

      context.restore()

      const mask = water.mask()

      if (mask) {
        context.save()
        context.globalCompositeOperation = 'destination-in'
        context.drawImage(
          mask,
          0,
          0,
          mask.width,
          mask.height,
          frame.left,
          frame.top,
          frame.width,
          frame.height,
        )
        context.restore()
      }

      return true
    },

    pointer(nx: number, ny: number, kind: 'move' | 'down' | 'leave'): void {
      if (kind === 'leave') {
        chain = null
        return
      }

      // A press is a deliberate strike and clears both throttles, so it lands
      // even where a pass a moment earlier already struck.
      if (kind === 'down') {
        spawnedAt = 0
        chain = null
      }

      // Off the art or off the water breaks the chain. The next ring is then
      // measured from where the pointer returns rather than from where it
      // left, so coming back to the same place strikes again.
      if (nx < 0 || nx > 1 || ny < 0 || ny > 1 || !water.isWaterPixel(nx, ny)) {
        chain = null
        return
      }

      strike(nx, ny, kind === 'down' ? PRESS_STRENGTH : MOVE_STRENGTH)
    },

    dispose(): void {
      pool.length = 0
      chain = null
      measured = null
      water.dispose()
    },
  }
}

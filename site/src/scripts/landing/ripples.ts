/* The rings a pointer leaves on the pond.
 *
 * A pointer crossing the water strikes a wave train that opens and fades.
 * This module owns the pool the strikes live in, ages them against the clock
 * the entry passes to the draw, and paints them inside the pond's own curve.
 *
 * What is drawn answers to the water rather than to the canvas. A strike
 * raises several crests and not one; they leave fast and slow as they go;
 * they thin and dim as they spread around a circle that keeps growing; and
 * they take the lantern on the face turned towards it. Every size in them is
 * a fraction of the frame, so a ripple is as large as the pond it is on.
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
// stand between the events and the pool: 95 milliseconds between rings, and a
// step across the water between one ring and the next. Under either, the
// rings stack into a wash instead of reading as separate strikes.
const SPAWN_GAP = 95

// Every ring costs a few strokes a frame, so the pool is bounded. A pointer
// can raise about eleven rings inside one ring's life at the gap above, so 14
// trims a runaway without ever trimming the effect.
const POOL_LIMIT = 14

// A ring lives between 940 and 1130 milliseconds. The life carries a spread,
// so two strikes in the same place do not move as one.
const LIFE = 940
const LIFE_SPREAD = 190

/*
 * Every size below is a fraction of the frame's shorter side, and that is the
 * point of them. A ripple is a thing on the pond, so it is as large as the
 * pond is: held in canvas pixels it stayed the size of a coin while the
 * painting grew to fill a 2560 screen, which is the tell that gave the old
 * rings away. The values are the pixel sizes this was first drawn at, divided
 * by the frame that was measured on.
 */

/** Where a ring starts. It is not nothing: a ring opening from a point spends
 *  its first frames too small to see, and the strike has to land on the frame
 *  it happens. */
const BIRTH = 0.006

/** How far a ring opens past its birth, and the spread each one carries. */
const REACH = 0.052
const REACH_SPREAD = 0.022

/** The step throttle: how far the pointer moves across the water before it
 *  may strike again. */
const SPAWN_STEP = 0.014

/** The crest's thickness where it is thickest, and the floor under it, so a
 *  ring on a small frame stays a line rather than fading to nothing. */
const CREST = 0.0027
const CREST_FLOOR = 0.75

/** A press is a firmer strike than a pass over the water. */
const MOVE_STRENGTH = 0.8
const PRESS_STRENGTH = 1.25

/**
 * How hard a ring opens against the clock.
 *
 * A strike spends its energy at once and the crest is fastest as it leaves,
 * slowing as it goes. A ring opening at a constant rate is the other tell of
 * a drawn ripple: real ones are almost fully open by half their life and
 * spend the rest of it drifting the last of the way out.
 */
const opening = (progress: number) => 1 - (1 - progress) ** 1.9

/**
 * The wave train one strike raises.
 *
 * A strike on water does not make a ring. It makes a packet of them: a
 * leading crest that carries most of the energy and a couple behind it,
 * weaker and closer together. Each one is a fraction of the leading crest's
 * own radius rather than a fixed distance behind it, so the packet spreads as
 * it travels — which is what a real one does, and what two rings held eight
 * pixels apart could never do at either end of their life.
 */
const TRAIN = [
  { at: 1, alpha: 1, width: 1.6 },
  { at: 0.72, alpha: 0.6, width: 1.15 },
  { at: 0.5, alpha: 0.3, width: 0.9 },
]

/**
 * The gain on a crest's brightness, and the direction the light comes from.
 *
 * Brightness falls as `1/√r`: a ring's energy is spread around a circle that
 * is always growing, so the crest thins out as it opens whatever the clock is
 * doing. The gain is what puts the curve back in a range the eye reads after
 * that fall and the fade have both taken their share.
 *
 * The direction is the lantern's. It stands up and to the right of the pond,
 * so the face of a crest turned that way catches it warm and the far face
 * keeps only the sky — which is the difference between a ring of even ink and
 * something lying on water.
 */
const GAIN = 2.3
const LIGHT_X = 0.82
const LIGHT_Y = -0.57

/** One ring, from the strike that raised it to the moment it is dropped. */
interface Ripple {
  /** Where it was struck, as a fraction of the art frame. */
  nx: number
  ny: number
  strength: number
  createdAt: number
  duration: number
  /** How far it opens past its start, as a fraction of the frame's shorter
   *  side. */
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
    const short = Math.min(frame.width, frame.height)
    const step = chain ? Math.hypot(x - chain.x, y - chain.y) : Infinity
    const now = performance.now()

    if (now - spawnedAt < SPAWN_GAP || step < short * SPAWN_STEP) return

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
      // so the rings end with the size they were struck at. Every measure a
      // ring carries is now a fraction of the frame, so they would land
      // correctly in the new size; what they would cost is the one frame that
      // can least afford them.
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
      const short = Math.min(frame.width, frame.height)
      const birth = short * BIRTH

      context.save()
      context.translate(frame.left, frame.top)
      context.clip(pondClip(frame.width, frame.height))

      for (const ripple of pool) {
        const progress = Math.min(1, (now - ripple.createdAt) / ripple.duration)
        const radius = birth + opening(progress) * short * ripple.reach
        // Two falls, and they are different things. The first is the clock
        // running out on the strike. The second is the crest spreading itself
        // around a circle that keeps growing, which is why a ring goes faint
        // as it opens and not merely as it ages.
        const fade =
          (1 - progress) * Math.sqrt(birth / radius) * ripple.strength * GAIN
        // A ring lies on the water, so it is drawn flattened. It flattens
        // less further down the art, where the surface is nearer the eye and
        // seen less edge on.
        const squash = 0.2 + ripple.ny * 0.11
        const x = ripple.nx * frame.width
        const y = ripple.ny * frame.height

        // One gradient for the whole train, laid across the leading crest.
        // The rings behind it stand inside that crest and so take the middle
        // of it, which is the right answer twice over: it saves two thirds of
        // the gradients, and an inner crest is the less tilted of the two and
        // does catch the lantern less unevenly.
        const lit = context.createLinearGradient(
          x + radius * LIGHT_X,
          y + radius * squash * LIGHT_Y,
          x - radius * LIGHT_X,
          y - radius * squash * LIGHT_Y,
        )
        lit.addColorStop(0, 'rgba(246, 251, 228, 1)')
        lit.addColorStop(0.42, 'rgba(196, 238, 231, 0.7)')
        lit.addColorStop(1, 'rgba(143, 201, 216, 0.3)')
        context.strokeStyle = lit

        for (const trail of TRAIN) {
          const ring = radius * trail.at

          if (ring <= 0) continue

          // The crest thins as it opens, for the same reason it dims: there
          // is no more water in it than the strike put there.
          context.lineWidth = Math.max(
            CREST_FLOOR,
            short * CREST * trail.width * (0.58 + 0.42 * (1 - opening(progress))),
          )
          context.globalAlpha = Math.min(1, fade * trail.alpha)
          context.beginPath()
          // The tilt is the pond's own in the art, about two degrees.
          context.ellipse(x, y, ring, ring * squash, -0.035, 0, Math.PI * 2)
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

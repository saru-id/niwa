/* The petals the flowers let go over the water.
 *
 * Three beds sit on the art. A pointer near one opens it: petals lift off,
 * drift sideways, sway as they turn, and fade out inside two seconds. The
 * nearer the pointer, the stronger the flow, and the strength runs through
 * one level that eases toward a target, so a bed opens over several frames
 * rather than on one.
 *
 * A petal's place is canvas pixels, fixed when it is born and carried forward
 * by its own speed. That is why a changed frame ends the ones in flight:
 * their pixels belong to the frame they left the bed on.
 *
 * The answer to a frame is false once no petal is left, the pointer is away,
 * and the level has settled.
 */

import type { Effect, Rect } from './geometry'

/** A bed on the art: its middle, and how far its petals start from it. */
interface Zone {
  x: number
  y: number
  radiusX: number
  radiusY: number
}

/** One petal in flight. The place is canvas pixels; the speed is pixels a
 *  second; the phase seeds both the sway and the turn, so a petal is one
 *  thing rather than several. */
interface Petal {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  spin: number
  phase: number
  coral: boolean
  bornAt: number
  duration: number
}

/** How much of the distance to the target the level covers in one frame. It
 *  is slower than the lantern's, because a bed answers a reader rather than
 *  tracking one. */
const EASE = 0.09

/** The distance at which the level and the target count as met. */
const REST = 0.01

/** The level a bed opens at. */
const FLOW = 0.2

/** Milliseconds between petals. One every tenth of a second reads as a drift
 *  rather than a spray. */
const SPACING = 92

/** How many petals fly at once. A pointer resting on a bed sends them a
 *  little faster than they fade, so the oldest leaves to make room. */
const LIMIT = 18

/** The pointer's reach, in a bed's own radius. Past this the flow is off. */
const REACH = 1.2

/** The target a bed has to earn to become the one the petals come from. */
const ENGAGED = 0.08

/** The beds, read off the art. */
function seedZones(): Zone[] {
  return [
    { x: 0.588, y: 0.433, radiusX: 0.072, radiusY: 0.075 },
    { x: 0.846, y: 0.548, radiusX: 0.09, radiusY: 0.1 },
    { x: 0.884, y: 0.815, radiusX: 0.072, radiusY: 0.07 },
  ]
}

export function createFlowers(): Effect {
  const zones = seedZones()
  const petals: Petal[] = []

  let active: Zone | undefined
  let target = 0
  let level = 0
  let lastPetalAt = 0

  const spawn = (frame: Rect, now: number) => {
    if (active === undefined || level < FLOW || now - lastPetalAt < SPACING) return

    lastPetalAt = now

    const angle = Math.random() * Math.PI * 2
    // The square root spreads the starts over the bed's whole area. Without
    // it they crowd the middle, where the area of each ring is smallest.
    const spread = Math.sqrt(Math.random())
    const originX = active.x + Math.cos(angle) * active.radiusX * spread
    // The lift starts a little above the bed's middle, where the blooms are.
    const originY =
      active.y +
      Math.sin(angle) * active.radiusY * spread -
      active.radiusY * 0.18

    petals.push({
      x: frame.left + frame.width * originX,
      y: frame.top + frame.height * originY,
      vx: (Math.random() - 0.5) * 0.018 * frame.width,
      vy: -(0.055 + Math.random() * 0.04) * frame.height,
      size: 2.7 + Math.random() * 1.9,
      spin: (Math.random() - 0.5) * 4,
      phase: Math.random() * Math.PI * 2,
      coral: Math.random() > 0.38,
      bornAt: now,
      duration: 1250 + Math.random() * 700,
    })

    while (petals.length > LIMIT) petals.shift()
  }

  return {
    // The beds are fractions of the art, so nothing is read from its pixels.
    init() {},

    resize() {
      petals.length = 0
    },

    draw(context, scene, now) {
      level += (target - level) * EASE
      spawn(scene.frame, now)

      // Backwards, so removing a spent petal leaves the rest where they are.
      for (let index = petals.length - 1; index >= 0; index -= 1) {
        const petal = petals[index]
        const age = now - petal.bornAt
        const progress = age / petal.duration

        if (progress >= 1) {
          petals.splice(index, 1)
          continue
        }

        const seconds = age / 1000
        const x = petal.x + petal.vx * seconds + Math.sin(petal.phase + progress * 6) * 5
        // The rise slows and the petal settles back a little: half a wave
        // over the whole life, added against the climb.
        const y = petal.y + petal.vy * seconds - Math.sin(progress * Math.PI) * 8
        const fadeIn = Math.min(1, progress * 7)
        const alpha = fadeIn * Math.pow(1 - progress, 1.45) * (0.62 + level * 0.38)

        context.save()
        context.translate(x, y)
        context.rotate(petal.phase + progress * petal.spin)
        context.fillStyle = petal.coral
          ? `rgba(255, 162, 125, ${Math.min(1, alpha * 1.18)})`
          : `rgba(255, 226, 166, ${alpha})`
        context.beginPath()
        context.ellipse(0, 0, petal.size * 1.82, petal.size * 0.68, 0, 0, Math.PI * 2)
        context.fill()
        context.restore()
      }

      return petals.length > 0 || target > REST || Math.abs(target - level) > REST
    },

    pointer(nx, ny, kind) {
      // A press is not a move: it leaves the flow as the last move set it.
      if (kind === 'down') return

      // A pointer that leaves the hero closes the bed at once. A pointer that
      // is merely off the art only drops the target: the level's own fall
      // shuts the bed a few frames later, so the flow thins out instead of
      // stopping on an edge the reader cannot see.
      if (kind === 'leave') {
        target = 0
        active = undefined
        return
      }

      if (nx < 0 || nx > 1 || ny < 0 || ny > 1) {
        target = 0
        return
      }

      let nearest: Zone | undefined
      let nearestDistance = Infinity

      for (const zone of zones) {
        // Measured in the bed's own radius on each axis, so a wide bed reads
        // as near across its width and not down its height.
        const distance = Math.hypot(
          (nx - zone.x) / zone.radiusX,
          (ny - zone.y) / zone.radiusY,
        )

        if (distance < nearestDistance) {
          nearestDistance = distance
          nearest = zone
        }
      }

      target = Math.max(0, 1 - nearestDistance / REACH)
      active = target > ENGAGED ? nearest : undefined
    },

    dispose() {
      petals.length = 0
      active = undefined
      target = 0
      level = 0
    },
  }
}

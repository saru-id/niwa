/* The needles the pine lets go.
 *
 * A pad that is moving drops needles — whether it is moving because a gust
 * reached it or because the reader's pointer did, since to a pad those are
 * the same event and the canopy already resolved them into one level. This
 * module asks the canopy which pads are stirring and takes needles off the
 * ones that are.
 *
 * A pine needle falls as a fascicle: two needles joined at the base, which is
 * why it does not flutter down the way a petal does. The pair is stiff and
 * unbalanced, so it drops fast, spins about its own join, and slips sideways
 * on the spin rather than rocking. That is the whole of the difference from
 * the petals over the water, and it is the reason both can be in the air at
 * once without reading as one effect twice.
 *
 * What happens at the bottom is the point of the module. The tree stands over
 * the far side of the pond, so a needle off the pad that reaches out over the
 * water lands on the water — and a thing landing on water makes a ring. The
 * needle asks the pond whether it came down on it and, if it did, hands the
 * strike to the ripples. Everything else lands on stone or planting and is
 * simply gone. Most needles never reach the pond, which is correct: the tree
 * only overhangs its corner, and a garden where every needle found the water
 * would be a garden with the tree in the wrong place.
 *
 * A needle's place is normalized art coordinates rather than canvas pixels,
 * because it is in the air for two seconds — long enough for a resize to
 * happen under it — and the pond it is aiming for is measured the same way.
 *
 * The answer to a frame is false once nothing is in the air.
 */

import type { Effect } from './geometry'
import { PADS } from './pine'
import { pointInPond } from './water'

/** Below this a pad is not moving enough to lose anything. Only a pad well
 *  into the wind lets go, so a gust takes needles off the two or three pads
 *  it is actually working rather than off the whole tree at once. */
const SHED = 0.42

/** Milliseconds between needles off one pad. Roughly one a second from a pad
 *  in full wind, and a gust only ever works two or three pads at a time.
 *
 * The first pass ran this five times faster and the tree rained: a pine drops
 * needles, it does not shed them in a stream, and a steady fall reads as
 * weather rather than as the tree answering. What should catch the eye is one
 * needle coming down, not a curtain of them. */
const SPACING = 900

/** How many needles may be in the air at once. A gust crosses seven pads and
 *  a reader can hold one open, so the ceiling is what keeps a long hover from
 *  filling the sky. */
const LIMIT = 8

/** How long a needle may stay in the air before it is dropped wherever it is.
 *  It is the fall from the highest pad to below the art with room to spare. */
const LIFE_MS = 5200

/** How fast a needle falls, as a share of the art's height per second, and
 *  the spread across needles. Pine falls faster than blossom and this is the
 *  number that says so. */
const FALL = 0.2
const FALL_SPREAD = 0.075

/** How far a needle slides sideways per second, as a share of the art's
 *  width. It is negative because the wind in this garden comes off the trunk
 *  and blows out over the water — the same direction the gust travels, and
 *  the reason the near pads can reach the pond at all. */
const DRIFT = -0.026
const DRIFT_SPREAD = 0.022

/** How hard a landing needle strikes the water. Well under a pointer's pass,
 *  because it is a needle: the ring should be noticed, not announced. */
const STRIKE = 0.42

/** A needle's length in canvas pixels at the frame it was measured on, and
 *  the frame that was. Needles are small real things, so the size follows the
 *  art's scale rather than the canvas's, but only just.
 *
 * The length is set against the pads rather than against the canvas: a pad is
 * around a tenth of the art wide, and a needle it drops has to be a legible
 * fraction of that or it reads as dust on the lens. The first pass was two
 * thirds of this and did exactly that. */
const LENGTH = 12
const LENGTH_SPREAD = 4
const MEASURED_ON = 1180

/** One fascicle in the air. The place is a fraction of the art; the speeds
 *  are fractions a second; the phase seeds the spin and the slip together, so
 *  a needle is one thing rather than two. */
interface Needle {
  nx: number
  ny: number
  fall: number
  drift: number
  length: number
  spin: number
  phase: number
  pale: boolean
  bornAt: number
}

/** What a needle needs from the tree above it and the water below it. */
export interface NeedlesPorts {
  /** How hard a pad is being worked, by index into the pine's pads. */
  stirring(index: number): number
  /** A needle came down on open water, in normalized art coordinates. */
  onWater(nx: number, ny: number, strength: number): void
}

export function createNeedles(ports: NeedlesPorts): Effect {
  const air: Needle[] = []
  // When each pad last let go, so a pad in steady wind sheds on a beat
  // instead of every frame it is stirred.
  const shedAt: number[] = PADS.map(() => 0)
  let last = 0

  const release = (index: number, now: number): void => {
    const pad = PADS[index]
    if (pad === undefined) return

    // Born somewhere in the pad's own body rather than at its middle, so a
    // pad sheds from its whole spread the way a real one does.
    const angle = Math.random() * Math.PI * 2
    const spread = Math.sqrt(Math.random())

    air.push({
      nx: pad.x + Math.cos(angle) * spread * pad.radiusX * 0.88,
      ny: pad.y + Math.sin(angle) * spread * pad.radiusY * 0.7,
      fall: FALL + Math.random() * FALL_SPREAD,
      drift: DRIFT - Math.random() * DRIFT_SPREAD,
      length: LENGTH + Math.random() * LENGTH_SPREAD,
      // Sign and rate together: a fascicle turns whichever way it left the
      // branch and keeps turning that way.
      spin: (1.6 + Math.random() * 2.4) * (Math.random() < 0.5 ? -1 : 1),
      phase: Math.random() * Math.PI * 2,
      // A few needles are the year's dead ones, which are what a pine
      // actually sheds. They read warm against the green.
      pale: Math.random() < 0.34,
      bornAt: now,
    })

    if (air.length > LIMIT) air.shift()
  }

  return {
    // Needles read nothing from the art. Where they may land is the pond's
    // own polygon, which is measured in the same fractions they fall through.
    init() {
      air.length = 0
      shedAt.fill(0)
      last = 0
    },

    resize() {},

    draw(context, scene, now) {
      // The first frame has no previous one to measure against, and a frame
      // after a long pause has one that would move every needle across the
      // whole art at once. Both are capped to a plausible step.
      const step = last === 0 ? 0 : Math.min(0.05, (now - last) / 1000)
      last = now

      for (const [index, pad] of PADS.entries()) {
        if (ports.stirring(index) < SHED) continue
        if (now - shedAt[index] < SPACING / Math.max(0.35, pad.mass)) continue
        shedAt[index] = now
        release(index, now)
      }

      if (air.length === 0) return false

      const { frame } = scene
      // Needles are small real things rather than features of the canvas, so
      // their length follows the art's scale — but gently, and never below
      // legible, so a needle on a phone is still a needle and not a dot.
      const scale = Math.max(0.62, Math.min(1.5, frame.width / MEASURED_ON))

      context.save()
      context.lineCap = 'round'

      for (let index = air.length - 1; index >= 0; index -= 1) {
        const needle = air[index]
        const age = now - needle.bornAt

        needle.ny += needle.fall * step
        // The slip is the spin seen sideways: a turning fascicle presents its
        // length to the air and then its edge, so it slides in time with its
        // own rotation instead of drifting evenly.
        const turn = needle.phase + (age / 1000) * needle.spin
        needle.nx += (needle.drift + Math.sin(turn) * 0.018) * step

        const landed = pointInPond(needle.nx, needle.ny)
        const gone = age > LIFE_MS || needle.ny > 1.04 || needle.nx < -0.04

        if (landed || gone) {
          if (landed) ports.onWater(needle.nx, needle.ny, STRIKE)
          air.splice(index, 1)
          continue
        }

        // In and out at the ends of the fall: a needle appears inside the
        // pad it left rather than on top of it, and thins away rather than
        // blinking out at the bottom of the art.
        const fade =
          Math.min(1, age / 260) * Math.min(1, Math.max(0, (LIFE_MS - age) / 420))
        if (fade <= 0.01) continue

        const x = frame.left + frame.width * needle.nx
        const y = frame.top + frame.height * needle.ny
        // Seen flat on, a turning needle is at its longest side on and
        // vanishes to nothing edge on. The floor keeps it from disappearing
        // outright at the crossing, which reads as a dropped frame.
        const foreshorten = 0.22 + Math.abs(Math.cos(turn)) * 0.78
        const half = (needle.length * scale * foreshorten) / 2
        // The pair opens a few degrees at the join, which is the shape that
        // says pine rather than grass.
        const tilt = Math.sin(turn * 0.5) * 0.9

        // A needle crosses the whole art on its way down, so it passes over
        // near-black sky and over lit planting inside one fall. Both tones
        // are set light enough to hold against the planting, which is the
        // harder of the two grounds.
        context.globalAlpha = fade * 0.95
        context.strokeStyle = needle.pale
          ? 'rgba(226, 203, 148, 1)'
          : 'rgba(167, 199, 166, 1)'
        context.lineWidth = Math.max(0.8, 1.25 * scale)

        for (const side of [-1, 1]) {
          const angle = tilt + side * 0.11
          context.beginPath()
          context.moveTo(x, y - half)
          context.lineTo(x + Math.sin(angle) * half * 2, y + Math.cos(angle) * half)
          context.stroke()
        }
      }

      context.restore()

      return air.length > 0
    },

    // Needles in the air have left the tree. What the pointer does, it does
    // to the pads, and the canopy owns that.
    pointer() {},

    dispose() {
      air.length = 0
      shedAt.fill(0)
      last = 0
    },
  }
}

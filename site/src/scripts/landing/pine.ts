/* The pine's shape, and the wind that crosses it.
 *
 * The tree in the art is niwaki: cloud-pruned, so its needles are gathered
 * into seven separate pads rather than one mass of canopy. That is the whole
 * reason the tree can answer anything at all. A canopy is one object and can
 * only be lit or not lit; pads are seven objects, and seven objects can be
 * reached one after another, which is what a gust of wind looks like.
 *
 * Two effects read this module. The canopy lights the pads; the needles fall
 * out of them. They share the shape here for the same reason the ripples and
 * the mask share `water.ts`: two jobs, one set of measurements, and a pad
 * that moved would otherwise move in one of them and not the other.
 *
 * Every measure is a fraction of the art's frame, so the tree keeps its shape
 * in either composition. The values are read off the art at 1536 by 1024 —
 * moving one moves the light off the needles it belongs to.
 */

/**
 * One cloud-pruned pad of needles.
 *
 * `at` is where along the wind's path the pad stands, from the first pad it
 * reaches to the last. It is not the same as `x`: the gust crosses the tree
 * along its own line, and what matters is the order and spacing pads are met
 * in, which is what this holds.
 *
 * `mass` is how much needle the pad carries. It scales both how much light it
 * catches and how much it has to drop, because those are the same fact about
 * a pad seen twice.
 */
export interface Pad {
  x: number
  y: number
  radiusX: number
  radiusY: number
  at: number
  mass: number
}

/**
 * The seven pads, in the order the wind reaches them.
 *
 * The wind comes off the trunk and blows out over the water, which is right
 * to left across the art. It is also the only direction that means anything
 * here: a gust running the other way pushes every needle away from the pond,
 * and the one thing this tree can do that no other effect in the scene can is
 * put something on the water from above it.
 */
export const PADS: readonly Pad[] = [
  { x: 0.961, y: 0.283, radiusX: 0.039, radiusY: 0.039, at: 0, mass: 0.62 },
  { x: 0.926, y: 0.101, radiusX: 0.042, radiusY: 0.033, at: 0.1, mass: 0.66 },
  { x: 0.838, y: 0.26, radiusX: 0.068, radiusY: 0.052, at: 0.32, mass: 1 },
  { x: 0.807, y: 0.065, radiusX: 0.065, radiusY: 0.049, at: 0.45, mass: 0.94 },
  { x: 0.707, y: 0.247, radiusX: 0.067, radiusY: 0.042, at: 0.71, mass: 0.88 },
  { x: 0.706, y: 0.127, radiusX: 0.066, radiusY: 0.046, at: 0.78, mass: 0.9 },
  { x: 0.62, y: 0.218, radiusX: 0.064, radiusY: 0.042, at: 1, mass: 0.82 },
]

/** How far past a pad's own edge a pointer is felt, as a share of its radius.
 *  The light meets a reader on the way in rather than one already there. */
const REACH = 1.75

/** How long a gust takes to cross the whole tree. */
export const GUST_MS = 2100

/** The quiet between gusts. A tree that never rests is a tree in a storm, and
 *  the spread is what keeps the reader from learning the beat. */
export const GUST_GAP_MS = 7400
export const GUST_GAP_SPREAD_MS = 4800

/** How wide the gust's front is, in the same units `at` is measured in. A
 *  front narrower than the gap between two pads moves the tree one pad at a
 *  time; wider, and the whole tree lifts together and the travel is lost. */
const FRONT = 0.34

/**
 * How hard the wind is on a pad at one moment of a gust.
 *
 * `head` is how far the front has travelled, and it runs past one so the last
 * pad is left as cleanly as the first was reached. The falloff is a raised
 * cosine: it leaves and arrives at nothing with no corner at either end,
 * which is the difference between a gust passing through a tree and a light
 * being switched on and off down a row.
 */
export function gustOn(pad: Pad, head: number): number {
  const distance = Math.abs(head - pad.at)
  if (distance >= FRONT) return 0
  return (Math.cos((distance / FRONT) * Math.PI) + 1) / 2
}

/**
 * How strongly a pointer at a place on the art reaches a pad.
 *
 * One at the pad's middle, nothing at the edge of its reach. The distance is
 * measured in the pad's own radii rather than in the frame's, so a long flat
 * pad answers along its length and not in a circle around its centre.
 */
export function padUnderPointer(pad: Pad, nx: number, ny: number): number {
  const dx = (nx - pad.x) / (pad.radiusX * REACH)
  const dy = (ny - pad.y) / (pad.radiusY * REACH)
  const distance = Math.hypot(dx, dy)
  if (distance >= 1) return 0
  return 1 - distance * distance
}

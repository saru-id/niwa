/* The wind in the pine, and the light it turns up in the needles.
 *
 * A gust crosses the tree every eight seconds or so, reaching the pads one
 * after another from the trunk outward. What it leaves behind it is light:
 * needles turning in the air catch the sky, and a pad that has just been
 * moved is brighter than one that has not. Nothing here bends a pixel. The
 * art is a painting and the pads are painted into it, so what a script can
 * honestly change is how much light comes off them, and the travel across the
 * tree is what a reader reads as wind.
 *
 * The pointer does the same thing to one pad that the gust does to all of
 * them, and both run through one level per pad. That is what makes a hover
 * feel like the reader's own gust rather than a second, different effect.
 *
 * The light is cool on purpose. The lantern below already owns every warm
 * thing in this scene, and a canopy lit warm reads as a second lamp hanging
 * in the tree. This one is the sky's own light: pale, blue-green, and weak
 * enough that it is only ever seen moving.
 *
 * The answer to a frame is false once no gust is running and every pad has
 * settled, so a still tree costs the loop nothing.
 */

import type { Effect } from './geometry'
import {
  GUST_GAP_MS,
  GUST_GAP_SPREAD_MS,
  GUST_MS,
  PADS,
  gustOn,
  padUnderPointer,
  type Pad,
} from './pine'

/** How much of the distance to the target a pad's level covers in one frame.
 *  Slower than the lantern's: a pad is a heavy thing full of needles, and it
 *  keeps moving for a moment after the wind has gone by. */
const EASE = 0.085

/** The level at which a pad counts as settled. */
const REST = 0.004

/** The brightest the wash over a pad ever gets. It is very low, and that is
 *  the whole of the restraint here: at anything the eye can see standing
 *  still, the pads read as bushes with lamps in them. */
const GLOW = 0.14

/** The brightest one spark ever gets. It is stated against the wash rather
 *  than on its own, because the two are the same light at two sizes and the
 *  ratio is the thing worth holding: a spark is a needle's width across, so
 *  it can carry a little more opacity than the wash and still be the smaller
 *  event. Left to fall out of the arithmetic it reached four times the wash,
 *  which is a pad full of stars. */
const SPARK_GLOW = GLOW * 1.5

/** How many points of light one pad at full mass carries, and the smallest a
 *  pad may have. They stand for needles catching the sky, so there are
 *  several and they are each nearly nothing. */
const SPARKS = 13
const SPARKS_FLOOR = 6

/** A spark's radius in canvas pixels. It does not scale with the frame: a
 *  needle is a needle, and one that grew with the canvas would be a leaf. */
const SPARK_RADIUS = 1.35

/** One point of light in a pad: where it sits inside that pad as a share of
 *  its radii, its own beat, and how bright it burns against its neighbours. */
interface Spark {
  ox: number
  oy: number
  phase: number
  glow: number
}

/** One pad's state: the light on it, where it is going, and its sparks. */
interface Lit {
  pad: Pad
  level: number
  target: number
  sparks: Spark[]
}

/** Scatter a pad's sparks. They are placed once and then kept, because a
 *  needle that moved every frame would be a firefly. */
function seedSparks(pad: Pad, seed: number): Spark[] {
  const count = Math.max(SPARKS_FLOOR, Math.round(SPARKS * pad.mass))
  const sparks: Spark[] = []

  for (let index = 0; index < count; index += 1) {
    // A turn that never closes on itself, so the points spread over the pad
    // instead of falling into spokes the way an even division does.
    const angle = (index * 2.399963 + seed) % (Math.PI * 2)
    const radius = Math.sqrt((index + 0.5) / count)
    sparks.push({
      ox: Math.cos(angle) * radius * 0.82,
      oy: Math.sin(angle) * radius * 0.72,
      phase: (index * 1.7 + seed) % (Math.PI * 2),
      glow: 0.62 + ((index * 7) % 5) * 0.095,
    })
  }

  return sparks
}

/** What the canopy is, plus the one thing the needles need from it. */
export interface Canopy extends Effect {
  /**
   * How much the wind is working a pad right now, from nothing to one.
   *
   * The needles read this rather than keeping a second copy of the gust and
   * the hover. A pad drops needles because it is moving, and this is what
   * moving means — so the two effects cannot disagree about which pads are in
   * the wind, which they would within a frame of each other if each ran its
   * own clock.
   */
  stirring(index: number): number
}

export function createCanopy(): Canopy {
  const lit: Lit[] = []
  // When the running gust started, and when the next one is due. A tree that
  // has not been looked at yet has no gust: the first one is scheduled off
  // the first frame's clock, so it arrives after the reader, not before.
  let gustFrom = 0
  let gustUntil = 0
  let nextGust = 0

  return {
    // The canopy reads nothing from the art. Its pads are fractions and its
    // gradients need the context a frame carries.
    init() {
      lit.length = 0
      for (const [index, pad] of PADS.entries()) {
        lit.push({ pad, level: 0, target: 0, sparks: seedSparks(pad, index * 2.3) })
      }
      gustFrom = 0
      gustUntil = 0
      nextGust = 0
    },

    resize() {},

    stirring(index: number): number {
      return lit[index]?.level ?? 0
    },

    draw(context, scene, now) {
      if (lit.length === 0) return false

      if (nextGust === 0) {
        nextGust = now + GUST_GAP_MS + Math.random() * GUST_GAP_SPREAD_MS
      } else if (now >= nextGust && now >= gustUntil) {
        gustFrom = now
        gustUntil = now + GUST_MS
        nextGust = gustUntil + GUST_GAP_MS + Math.random() * GUST_GAP_SPREAD_MS
      }

      // The head runs from below nothing to above one, so the first pad is
      // reached by a front arriving from off the tree and the last is left by
      // one leaving it. Started at zero, the tree's near side would light the
      // instant a gust began.
      const running = now < gustUntil
      const head = running ? -0.3 + ((now - gustFrom) / GUST_MS) * 1.6 : 0

      const { frame } = scene
      let moving = running

      context.save()
      // Light added to a painting, never ink laid over it: the pads keep
      // their own colour and only get brighter, which is what stops the glow
      // from washing the needles into one flat shape.
      context.globalCompositeOperation = 'screen'

      for (const pad of lit) {
        const wind = running ? gustOn(pad.pad, head) : 0
        // The reader's hand and the weather are the same thing to a pad, so
        // the stronger of the two wins rather than the two adding up into a
        // brightness neither one asked for.
        const goal = Math.max(pad.target, wind)
        pad.level += (goal - pad.level) * EASE

        if (Math.abs(pad.target - pad.level) > REST) moving = true
        if (pad.level <= REST) continue

        const strength = pad.level * pad.pad.mass
        const centerX = frame.left + frame.width * pad.pad.x
        const centerY = frame.top + frame.height * pad.pad.y
        const radiusX = frame.width * pad.pad.radiusX
        const radiusY = frame.height * pad.pad.radiusY

        // The wash is the pad as a whole turning its face to the sky. It is
        // drawn as a circle and squashed onto the pad's own proportions, so
        // one gradient serves a shape that is nearly always wider than tall.
        context.save()
        context.translate(centerX, centerY)
        context.scale(1, radiusY / radiusX)

        const wash = context.createRadialGradient(0, 0, 0, 0, 0, radiusX)
        // It falls away fast, so the light stays on the pad rather than
        // spreading into the sky around it. A gentle ramp put a halo on the
        // black behind the tree and read as fog rather than as needles.
        wash.addColorStop(0, `rgba(206, 236, 226, ${GLOW * strength})`)
        wash.addColorStop(0.42, `rgba(163, 208, 201, ${GLOW * 0.42 * strength})`)
        wash.addColorStop(1, 'rgba(120, 168, 170, 0)')
        context.fillStyle = wash
        context.beginPath()
        context.arc(0, 0, radiusX, 0, Math.PI * 2)
        context.fill()
        context.restore()

        // The sparks are single needles inside that wash. Each one has its
        // own beat, so a moving pad glitters rather than pulsing, and each
        // fades with the pad it belongs to.
        for (const spark of pad.sparks) {
          const twinkle = 0.45 + (Math.sin(now * 0.0042 + spark.phase) + 1) * 0.275
          const alpha = SPARK_GLOW * strength * twinkle * spark.glow
          if (alpha <= 0.01) continue

          const x = centerX + spark.ox * radiusX
          const y = centerY + spark.oy * radiusY

          context.fillStyle = `rgba(226, 246, 235, ${alpha})`
          context.beginPath()
          context.arc(x, y, SPARK_RADIUS, 0, Math.PI * 2)
          context.fill()
        }
      }

      context.restore()

      return moving
    },

    pointer(nx, ny, kind) {
      for (const pad of lit) {
        pad.target = kind === 'leave' ? 0 : padUnderPointer(pad.pad, nx, ny)
      }
    },

    dispose() {
      lit.length = 0
      gustFrom = 0
      gustUntil = 0
      nextGust = 0
    },
  }
}

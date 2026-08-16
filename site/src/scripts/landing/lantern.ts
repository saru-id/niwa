/* The lantern's light on the hero art.
 *
 * The lantern always burns. A slow flicker rides over a warm halo, two lit
 * panes, and a spill on the water below it. What a pointer changes is how
 * hard it burns: the light rises as the pointer nears the flame and falls
 * back when the pointer moves off. Both moves run through one level that
 * eases toward a target, so the light never jumps.
 *
 * Every place is a fraction of the scene's frame, which puts the light on the
 * painted lantern in either composition. Every radius is a fraction of the
 * frame's shorter side, so a wide canvas does not stretch a round glow.
 *
 * The answer to a frame is false once the pointer is away and the level has
 * settled. The flicker still moves, but only while the entry holds the loop
 * open, and this answer covers the lantern's own state alone.
 */

import type { Effect } from './geometry'

/** One lit pane in the lantern's box: where it sits on the art, how far its
 *  light carries as a fraction of the frame's shorter side, and how bright it
 *  is against the other pane. */
interface Pane {
  x: number
  y: number
  radius: number
  strength: number
}

/** The flame, as a fraction of the art. */
const FLAME_X = 0.625
const FLAME_Y = 0.354

/** How far from the flame the answer reaches, in fractions of the art. It is
 *  much wider than the painted lantern, so the light meets a pointer on its
 *  way in rather than one already there. */
const REACH = 0.17

/** How much of the distance to the target the level covers in one frame. */
const EASE = 0.12

/** The distance at which the level and the target count as met. A hundredth
 *  of the response is under what a screen can show. It is also where the
 *  spill on the water starts, so the pointer's own light appears with the
 *  first step the level takes. */
const REST = 0.01

export function createLantern(): Effect {
  // The panes are fixed geometry. They are built with the effect rather than
  // rebuilt inside every frame.
  const panes: Pane[] = [
    { x: 0.618, y: 0.355, radius: 0.018, strength: 1 },
    { x: 0.641, y: 0.356, radius: 0.012, strength: 0.78 },
  ]

  let target = 0
  let level = 0

  return {
    // The lantern reads nothing from the art. Its places are fractions, and
    // its gradients need the context a frame carries.
    init() {},

    resize() {},

    draw(context, scene, now) {
      const { frame } = scene
      level += (target - level) * EASE

      // Two waves at different speeds, neither a multiple of the other, so
      // the flame never repeats on a beat a reader can count.
      const flicker =
        0.95 + Math.sin(now * 0.0037) * 0.025 + Math.sin(now * 0.0091) * 0.015
      const response = 0.46 + level * 0.54
      const short = Math.min(frame.width, frame.height)
      const centerX = frame.left + frame.width * FLAME_X
      const centerY = frame.top + frame.height * FLAME_Y

      context.save()

      const broadRadius = short * (0.052 + level * 0.014)
      const ambient = context.createRadialGradient(
        centerX,
        centerY,
        2,
        centerX,
        centerY,
        broadRadius,
      )
      ambient.addColorStop(0, `rgba(255, 181, 84, ${0.22 * response * flicker})`)
      ambient.addColorStop(0.32, `rgba(244, 139, 65, ${0.085 * response})`)
      ambient.addColorStop(1, 'rgba(231, 113, 52, 0)')
      context.fillStyle = ambient
      context.fillRect(
        centerX - broadRadius,
        centerY - broadRadius,
        broadRadius * 2,
        broadRadius * 2,
      )

      for (const pane of panes) {
        const x = frame.left + frame.width * pane.x
        const y = frame.top + frame.height * pane.y
        const radius = short * pane.radius
        const glow = context.createRadialGradient(x, y, 0, x, y, radius)

        glow.addColorStop(
          0,
          `rgba(255, 246, 197, ${0.92 * response * pane.strength * flicker})`,
        )
        glow.addColorStop(0.18, `rgba(255, 192, 92, ${0.72 * response * pane.strength})`)
        glow.addColorStop(0.58, `rgba(242, 126, 52, ${0.22 * response * pane.strength})`)
        glow.addColorStop(1, 'rgba(232, 104, 43, 0)')
        context.fillStyle = glow
        context.fillRect(x - radius, y - radius, radius * 2, radius * 2)
      }

      // The spill belongs to the pointer alone: the lantern's own burn lights
      // the box, and the water only catches it when the reader comes close.
      if (level > REST) {
        const spillX = frame.left + frame.width * FLAME_X
        const spillY = frame.top + frame.height * 0.405
        const spillRadius = short * 0.078
        const spill = context.createRadialGradient(
          spillX,
          spillY,
          0,
          spillX,
          spillY,
          spillRadius,
        )

        spill.addColorStop(0, `rgba(255, 190, 104, ${0.12 * level * flicker})`)
        spill.addColorStop(0.5, `rgba(246, 145, 77, ${0.052 * level})`)
        spill.addColorStop(1, 'rgba(238, 124, 68, 0)')
        context.fillStyle = spill
        context.beginPath()
        // The spill lies on the water, so it is flattened and turned to the
        // angle the water sits at.
        context.ellipse(
          spillX,
          spillY,
          spillRadius * 1.28,
          spillRadius * 0.68,
          -0.08,
          0,
          Math.PI * 2,
        )
        context.fill()
      }

      context.restore()

      return target > REST || Math.abs(target - level) > REST
    },

    pointer(nx, ny, kind) {
      // A press is not a move: it leaves the light where the last move put it.
      if (kind === 'down') return

      // Off the art is a position like any other, and the light it asks for is
      // none. The level carries the fall, so the lantern dims instead of
      // dropping.
      if (kind === 'leave' || nx < 0 || nx > 1 || ny < 0 || ny > 1) {
        target = 0
        return
      }

      target = Math.max(0, 1 - Math.hypot(nx - FLAME_X, ny - FLAME_Y) / REACH)
    },

    dispose() {
      target = 0
      level = 0
    },
  }
}

/* The fireflies over the garden.
 *
 * Ten lights, each at its own place on the art, each with its own phase and
 * its own speed. A firefly wanders a little around its place and pulses on a
 * faster beat, and no two share a phase, so the field never blinks together.
 *
 * The drift is a fraction of the frame, so a light keeps its place on the art
 * at any size. The halo is not: a firefly is a point of light, and a point
 * that grew with the canvas would read as a lamp.
 *
 * The field has no rest. It answers true from the moment it exists, and the
 * entry's gate is what ends the loop.
 */

import type { Effect } from './geometry'

/** One light: its place on the art, where its wander starts, how fast it
 *  moves, and how bright it burns against the rest. */
interface Firefly {
  x: number
  y: number
  phase: number
  drift: number
  glow: number
}

/** The field's places, read off the art. */
function seedFireflies(): Firefly[] {
  return [
    { x: 0.555, y: 0.365, phase: 0.3, drift: 0.9, glow: 0.92 },
    { x: 0.625, y: 0.415, phase: 1.7, drift: 1.2, glow: 0.82 },
    { x: 0.684, y: 0.337, phase: 3.2, drift: 0.8, glow: 0.9 },
    { x: 0.735, y: 0.382, phase: 4.4, drift: 1.1, glow: 1 },
    { x: 0.792, y: 0.405, phase: 5.7, drift: 0.95, glow: 0.86 },
    { x: 0.842, y: 0.452, phase: 2.5, drift: 0.75, glow: 0.96 },
    { x: 0.891, y: 0.405, phase: 6.4, drift: 1.25, glow: 0.84 },
    { x: 0.918, y: 0.492, phase: 7.8, drift: 0.88, glow: 0.92 },
    { x: 0.864, y: 0.557, phase: 8.9, drift: 1.05, glow: 0.88 },
    { x: 0.775, y: 0.523, phase: 10.1, drift: 0.82, glow: 0.9 },
  ]
}

export function createFireflies(): Effect {
  let field: Firefly[] = []

  return {
    init() {
      field = seedFireflies()
    },

    resize() {},

    draw(context, scene, now) {
      if (field.length === 0) return false

      const { frame } = scene

      context.save()

      for (const firefly of field) {
        const time = now * 0.0008 * firefly.drift + firefly.phase
        const x = frame.left + frame.width * (firefly.x + Math.sin(time * 1.7) * 0.008)
        const y = frame.top + frame.height * (firefly.y + Math.cos(time * 1.15) * 0.012)
        // Squaring a wave holds the light low for most of the beat and
        // brings it up in a short rise, the shape a firefly pulses in.
        const flicker = 0.68 + Math.pow((Math.sin(time * 4.2) + 1) / 2, 2) * 0.32
        const strength = flicker * firefly.glow
        const radius = 11 + firefly.glow * 3
        const halo = context.createRadialGradient(x, y, 0, x, y, radius)

        halo.addColorStop(0, `rgba(255, 248, 195, ${0.98 * strength})`)
        halo.addColorStop(0.2, `rgba(248, 191, 99, ${0.58 * strength})`)
        halo.addColorStop(1, 'rgba(245, 154, 93, 0)')
        context.fillStyle = halo
        context.beginPath()
        context.arc(x, y, radius, 0, Math.PI * 2)
        context.fill()

        // The body inside the halo is the part the eye follows.
        context.fillStyle = `rgba(255, 252, 224, ${0.96 * strength})`
        context.beginPath()
        context.arc(x, y, 1.35 + strength * 0.85, 0, Math.PI * 2)
        context.fill()
      }

      context.restore()

      return true
    },

    // The fireflies keep to themselves. A pointer changes nothing here.
    pointer() {},

    dispose() {
      field = []
    },
  }
}

/* The hero scene's life: when it starts, what it draws, and when it stops.
 *
 * Everything the scene needs from the document is read here. The entry owns
 * the canvas, its context and the density transform; the observers, the media
 * queries and the three pointer listeners; and the order the effects draw in
 * with the gates that decide which of them are called at all. An effect owns
 * its own pixels and nothing else.
 *
 * Nothing happens until `start` runs. The scene is decoration, and decoration
 * that allocates while the page is still becoming readable has taken from the
 * thing it decorates. The page calls `start` from its own script tag, which
 * is also the only place the scene is turned on, so a page that does not want
 * it simply does not call it.
 *
 * The build runs whether or not motion is reduced. Reduced motion is a gate
 * on drawing, not on allocation, so a reader who allows motion part way
 * through has the scene already built and sees it on the next frame.
 *
 * The document this reads:
 * - `.hero` — the section the pointer listeners sit on.
 * - `.hero-art-wrap` — the box the art fills; the scene is measured from it.
 * - `.hero-art` — the art, and the natural size the frame is built on.
 * - `.pond-ripples` — the canvas the effects draw into.
 *
 * A page missing any of them gets no scene, and no errors either.
 */

import {
  createBasin,
  createFireflies,
  createFlowers,
  createLantern,
  createRipples,
} from './effects'
import { computeScene, LANDING_QUERY, type Effect, type Rect, type Scene } from './geometry'

// How long after load the scene may first ask for idle time. By two seconds
// the page has painted, the fonts have settled and every deferred script has
// run, so the start lands in a window where nothing is waiting on it. A
// reader who has already left the hero by then never pays for it at all.
const IDLE_FLOOR_MS = 2000

// A sliver of the hero counts as seen. The art runs to the top of the page,
// so the reader is looking at the scene well before a large fraction of the
// section is on screen.
const HERO_SEEN = 0.02

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

// The position the entry reports when a hover ends and no pointer event
// carries one. Normalized art coordinates run 0 to 1 across the frame, so
// anything below 0 is off the art, and every effect resets on it.
const OFF_THE_ART = -1

function sameRect(a: Rect, b: Rect): boolean {
  return a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height
}

function sameScene(a: Scene, b: Scene): boolean {
  return (
    a.density === b.density &&
    a.mobile === b.mobile &&
    sameRect(a.canvas, b.canvas) &&
    sameRect(a.frame, b.frame)
  )
}

/**
 * Run a piece of work when the browser has time for it.
 *
 * Safari has no idle callback, and a timeout of one millisecond is the
 * nearest honest substitute: it is a task of its own, so the browser keeps
 * the frame it is in.
 */
function idle(task: () => void): void {
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => {
      task()
    })
    return
  }
  window.setTimeout(task, 1)
}

/** Turn the hero scene on. */
export function start(): void {
  const hero = document.querySelector<HTMLElement>('.hero')
  const wrap = document.querySelector<HTMLElement>('.hero-art-wrap')
  const image = document.querySelector<HTMLImageElement>('.hero-art')
  const canvas = document.querySelector<HTMLCanvasElement>('.pond-ripples')
  if (hero === null || wrap === null || image === null || canvas === null) return

  const context = canvas.getContext('2d')
  if (context === null) return

  const ripples = createRipples()
  const basin = createBasin()
  const lantern = createLantern()
  const fireflies = createFireflies()
  const flowers = createFlowers()
  const effects: readonly Effect[] = [ripples, basin, lantern, fireflies, flowers]

  const reduced = window.matchMedia(REDUCED_MOTION)
  const narrow = window.matchMedia(LANDING_QUERY)

  let scene: Scene | undefined
  let seen = false
  let allowed = false
  let starting = false
  let ready = false
  let moved = false
  let stopped = false
  let loop = 0
  let resizing = 0
  let floor = 0

  /**
   * Measure the scene, and answer with it when it has changed.
   *
   * The canvas box, the backing store and the transform are written here and
   * only here, so the transform is never left behind by a store that moved.
   */
  const measure = (): Scene | undefined => {
    const next = computeScene(
      wrap.getBoundingClientRect(),
      { w: image.naturalWidth, h: image.naturalHeight },
      narrow.matches,
      window.devicePixelRatio,
    )
    if (scene !== undefined && sameScene(scene, next)) return undefined

    scene = next
    canvas.style.left = `${next.canvas.left}px`
    canvas.style.top = `${next.canvas.top}px`
    canvas.style.width = `${next.canvas.width}px`
    canvas.style.height = `${next.canvas.height}px`
    canvas.width = Math.max(1, Math.round(next.canvas.width * next.density))
    canvas.height = Math.max(1, Math.round(next.canvas.height * next.density))
    context.setTransform(next.density, 0, 0, next.density, 0, 0)
    return next
  }

  const frame = (now: number): void => {
    loop = 0
    if (stopped || scene === undefined) return

    const awake = seen && !reduced.matches
    const ambient = awake && !scene.mobile

    context.clearRect(0, 0, scene.canvas.width, scene.canvas.height)

    // The basin moves on its own for as long as the scene is awake, so the
    // entry's own gate is what keeps the loop going; the ambient set sits
    // inside that gate. An effect that is not called says nothing here.
    let animating = awake
    if (ripples.draw(context, scene, now)) animating = true
    if (awake && basin.draw(context, scene, now)) animating = true
    if (ambient && lantern.draw(context, scene, now)) animating = true
    if (ambient && fireflies.draw(context, scene, now)) animating = true
    if (ambient && flowers.draw(context, scene, now)) animating = true

    // At rest the loop ends rather than idling, so the main thread reaches
    // windows with nothing scheduled in them.
    if (animating) loop = window.requestAnimationFrame(frame)
  }

  const schedule = (): void => {
    if (loop === 0 && ready && !stopped) loop = window.requestAnimationFrame(frame)
  }

  const remeasure = (): void => {
    if (stopped || scene === undefined) return
    const next = measure()
    if (next === undefined) return
    // The buffers an effect rebuilds here are fixed-size, so the rebuild is
    // one bounded piece of work however far the window was dragged.
    if (ready) for (const effect of effects) effect.resize(next)
    // Mid-build, the effects already holding buffers are holding them for a
    // scene that no longer exists. The end of the build settles that for all
    // of them at once rather than each build piece checking.
    else moved = true
    schedule()
  }

  /**
   * Run the start as a chain of idle pieces.
   *
   * The measurement and each effect's own buffers are separate work, and the
   * browser gets to put a frame between any two of them. One task that builds
   * the whole scene would be one task the reader feels.
   */
  const chain = (tasks: readonly (() => void)[]): void => {
    let index = 0
    const next = (): void => {
      if (stopped) return
      const task = tasks[index]
      index += 1
      if (task === undefined) {
        ready = true
        if (moved && scene !== undefined) {
          moved = false
          for (const effect of effects) effect.resize(scene)
        }
        schedule()
        return
      }
      // An effect that cannot read its pixels leaves a still scene, never a
      // dead page. The effects behind it in the chain are owed their turn
      // whatever happened to it, and it keeps whatever it built before it
      // failed: an effect with no buffers draws nothing and says so.
      try {
        task()
      } catch {}
      idle(next)
    }
    idle(next)
  }

  const build = (): void => {
    if (stopped) return
    chain([
      measure,
      ...effects.map((effect) => () => {
        if (scene !== undefined) effect.init(image, scene)
      }),
    ])
  }

  const startEffects = (): void => {
    if (!allowed || starting || stopped || !seen) return
    starting = true
    idle(() => {
      if (stopped) return
      // The decoded pixels are what the first sample reads, and a decode runs
      // long enough to be seen inside a frame. It happens here, once, and
      // never on the way to a draw.
      void image.decode().then(build, () => {
        // Art that will not decode has no pixels to sample, and asking again
        // would not produce any.
      })
    })
  }

  const onLoad = (): void => {
    floor = window.setTimeout(() => {
      allowed = true
      startEffects()
    }, IDLE_FLOOR_MS)
  }

  const send = (event: PointerEvent, kind: 'move' | 'down' | 'leave'): void => {
    // A touch has no hover, and a tap that raised ripples would fight the
    // scroll it was meant to be.
    if (event.pointerType === 'touch') return
    if (!ready || scene === undefined) return

    const awake = seen && !reduced.matches
    // Only a move needs a scene that is being drawn. A leave ends a hover the
    // reader has finished, which must not be left lit behind a gate that
    // closed mid-gesture.
    if (kind === 'move' && !awake) return

    // The wrap is sticky, so the canvas moves under the pointer as the page
    // scrolls and a box measured once drifts away from it.
    const box = canvas.getBoundingClientRect()
    const nx = (event.clientX - box.left - scene.frame.left) / scene.frame.width
    const ny = (event.clientY - box.top - scene.frame.top) / scene.frame.height

    // The water owns the press ripple and how hard it lands. The entry owns
    // whether a press may raise one at all. A press the scene would not draw
    // still ends the chain the last press started, and a leave is what says
    // so. Nothing else hears a press: the lantern and the flowers follow the
    // hover alone.
    if (kind === 'down' && !awake) ripples.pointer(nx, ny, 'leave')
    else for (const effect of effects) effect.pointer(nx, ny, kind)
    schedule()
  }

  /**
   * Report a hover that ended without a pointer to say so.
   *
   * Scrolling the hero off the screen ends the hover, and the pointer never
   * moved, so no event is coming. Left alone the lantern stays lit and the
   * flower bed stays open behind the reader.
   */
  const endHover = (): void => {
    if (!ready) return
    for (const effect of effects) effect.pointer(OFF_THE_ART, OFF_THE_ART, 'leave')
  }

  const onMove = (event: PointerEvent): void => {
    send(event, 'move')
  }
  const onDown = (event: PointerEvent): void => {
    send(event, 'down')
  }
  const onLeave = (event: PointerEvent): void => {
    send(event, 'leave')
  }

  const onHidden = (): void => {
    if (document.visibilityState !== 'hidden') {
      schedule()
      return
    }
    // A hidden tab is given no animation frames, so a scheduled one would sit
    // pending until the reader came back. Dropping it lets the entry decide
    // again on the state it finds then.
    if (loop !== 0) window.cancelAnimationFrame(loop)
    loop = 0
  }

  const visibility = new IntersectionObserver(
    (entries) => {
      const entry = entries[entries.length - 1]
      if (entry === undefined) return
      seen = entry.isIntersecting
      if (!seen) {
        endHover()
        return
      }
      // The observer is armed before the scene may start, so a reader who has
      // scrolled past the hero inside the first two seconds pays nothing. The
      // start waits here until the hero is looked at.
      startEffects()
      schedule()
    },
    { threshold: HERO_SEEN },
  )

  const resizes = new ResizeObserver(() => {
    if (resizing !== 0) return
    resizing = window.requestAnimationFrame(() => {
      resizing = 0
      remeasure()
    })
  })

  const stop = (): void => {
    if (stopped) return
    stopped = true
    window.clearTimeout(floor)
    if (loop !== 0) window.cancelAnimationFrame(loop)
    if (resizing !== 0) window.cancelAnimationFrame(resizing)
    loop = 0
    resizing = 0
    visibility.disconnect()
    resizes.disconnect()
    reduced.removeEventListener('change', schedule)
    narrow.removeEventListener('change', remeasure)
    window.removeEventListener('load', onLoad)
    window.removeEventListener('pagehide', onPageHide)
    document.removeEventListener('visibilitychange', onHidden)
    hero.removeEventListener('pointermove', onMove)
    hero.removeEventListener('pointerdown', onDown)
    hero.removeEventListener('pointerleave', onLeave)
    for (const effect of effects) effect.dispose()
  }

  const onPageHide = (event: PageTransitionEvent): void => {
    // A page held in the back and forward cache is coming back whole, with
    // its buffers and its listeners. Tearing it down here would hand the
    // reader a blank canvas on return and nothing to rebuild it.
    if (!event.persisted) stop()
  }

  visibility.observe(hero)
  resizes.observe(wrap)
  // One frame answers a motion change in both directions: the draw pass reads
  // the gates, so a scene that has just been parked clears itself and a scene
  // that has just been released starts moving.
  reduced.addEventListener('change', schedule)
  narrow.addEventListener('change', remeasure)
  hero.addEventListener('pointermove', onMove)
  hero.addEventListener('pointerdown', onDown)
  hero.addEventListener('pointerleave', onLeave)
  document.addEventListener('visibilitychange', onHidden)
  window.addEventListener('pagehide', onPageHide)

  if (document.readyState === 'complete') onLoad()
  else window.addEventListener('load', onLoad)
}

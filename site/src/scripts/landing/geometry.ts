/* The hero scene's geometry, and the contract every effect draws under.
 *
 * The hero paints over a still image that CSS places, so the canvas and every
 * effect drawing into it have to agree with the stylesheet about which pixels
 * are where. One function answers that: it takes the measurements the entry
 * reads from the document and returns the boxes a draw needs.
 *
 * Nothing here touches the document, and nothing is built until the function
 * runs. The canvas, the context, the observers and the listeners belong to the
 * entry, which passes numbers in and gets numbers back.
 *
 * Rules the entry enforces and every effect relies on:
 *
 * - Draw order is fixed: clear, then ripples, then the basin, then the
 *   lantern, the fireflies and the flowers. The order is load-bearing.
 *   Ripples ends by compositing the water mask over the whole canvas with
 *   `destination-in`, which erases every pixel outside the water. Save and
 *   restore protect state, not pixels, so anything drawn before that
 *   composite that should survive it must not exist: ripples draws first.
 * - The entry gates the calls. Ripples draws while it holds live ripples.
 *   The basin draws while the hero is visible and motion is not reduced.
 *   The lantern, the fireflies and the flowers add `scene.covered` being
 *   false to that. An effect that is not called contributes nothing to the
 *   reschedule answer.
 * - No effect calls `setTransform`: the entry applies the density transform
 *   and re-applies it after any resize of the backing store.
 * - `scene.canvas` is for drawing. Pointer math reads a live
 *   `getBoundingClientRect` in the entry: the wrap is sticky, and a cached
 *   box drifts with scroll.
 */

/** A box in CSS pixels. */
export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

/** One measurement of the scene, shared by the canvas and every effect. */
export interface Scene {
  /** The ripple canvas's box, in the art wrap's coordinates. */
  canvas: Rect
  /**
   * Where the art's pixels sit, with the canvas's own top left as the origin.
   *
   * The canvas box's offsets are CSS placement inside the wrap, so they never
   * appear here. Contained art fills the canvas: the frame carries the
   * canvas's size at the origin. Covering art is larger than the canvas, and
   * the frame's left or top is negative by the part that hangs outside.
   *
   * A place on the art is a fraction of this box: an effect reads it as
   * `frame.left + nx * frame.width`, so the same fraction lands on the same
   * detail in either composition.
   */
  frame: Rect
  /** The backing store's scale. The context carries it before any draw. */
  density: number
  /**
   * True where the art covers the wrap rather than being contained in it.
   *
   * It is a fact about the composition, not about the device: a phone and a
   * tablet held upright both answer true, and the same tablet turned on its
   * side answers false. Everything that reads it is reasoning about the
   * covered composition — the whole wrap repainted every frame — and not
   * about who is holding the screen.
   */
  covered: boolean
}

/**
 * Where the landing's two compositions divide, as `matchMedia` takes it.
 *
 * Two conditions, and either one is enough. The width is the phone: below it
 * there is no room for a column of copy beside a picture. The aspect ratio is
 * the tablet held upright, which is wide enough for the contained
 * composition and far too tall for it — the art is three by two, so on a
 * portrait screen it fills a strip along the bottom and strands the promise
 * in an empty field above it. Either way the answer is the same one: stop
 * setting the garden beside the copy and put it behind.
 *
 * This module is where the boundary is decided; the landing stylesheet
 * mirrors it, because the scene has to change composition on the same pixel
 * the layout changes on and a script cannot read a stylesheet for one number.
 * The condition is bare because `matchMedia` treats an `@media` prefix as an
 * unparseable query and then reports no match for the life of the page.
 * Testing `innerWidth` in its place would disagree with the stylesheet by
 * the width of a scrollbar.
 */
export const LANDING_QUERY = '(max-width: 780px), (max-aspect-ratio: 1/1)'

/**
 * The scene for one measurement of the page.
 *
 * `wrap` is the art wrap's box, `natural` the art's own pixel size — read
 * from a decoded image; the entry awaits `img.decode()` first, because an
 * unmeasured image reads zero and zero divides into nothing usable —
 * `covered` the boundary's answer, and `dpr` the screen's device pixel
 * ratio.
 *
 * The two compositions mirror the stylesheet. Outside the boundary the art is
 * contained in the wrap and anchored to its right bottom corner, so the canvas
 * is the art and the frame fills it. Inside it the art covers the wrap, so the
 * canvas is the whole wrap and the art overflows it, held at 65% across and
 * 50% down.
 */
export function computeScene(
  wrap: Rect,
  natural: { w: number; h: number },
  covered: boolean,
  dpr: number,
): Scene {
  // The caps bound the backing store's memory and fill cost. The covered
  // composition repaints the whole wrap every frame, and past 1.25 the extra
  // pixels cost more fill than they show — which is why the cap follows the
  // composition and not the screen: an upright tablet has the larger wrap of
  // the two and pays the most for it. Two covers every common desktop
  // density without letting a dense display quadruple a store whose source
  // detail tops out at 1536 pixels. A screen that reports no ratio still has
  // to be drawn on, so it counts as one.
  const density = Math.min(dpr || 1, covered ? 1.25 : 2)

  if (covered) {
    const scale = Math.max(wrap.width / natural.w, wrap.height / natural.h)
    const width = natural.w * scale
    const height = natural.h * scale
    return {
      canvas: { left: 0, top: 0, width: wrap.width, height: wrap.height },
      frame: {
        left: (wrap.width - width) * 0.65,
        top: (wrap.height - height) * 0.5,
        width,
        height,
      },
      density,
      covered,
    }
  }

  const aspect = natural.w / natural.h
  let width = wrap.width
  let height = width / aspect
  if (height > wrap.height) {
    height = wrap.height
    width = height * aspect
  }

  return {
    canvas: {
      left: wrap.width - width,
      top: wrap.height - height,
      width,
      height,
    },
    frame: { left: 0, top: 0, width, height },
    density,
    covered,
  }
}

/** What every effect in the scene implements. */
export interface Effect {
  /**
   * Reads the art's pixels and allocates buffers. The entry runs it in the
   * idle start, never inside a draw.
   */
  init(image: HTMLImageElement, scene: Scene): void
  resize(scene: Scene): void
  /**
   * Draws one frame. Returns true while this effect still has something to
   * animate, so the entry reschedules while any effect answers true. The
   * answer covers this effect's own state alone: the gates that decide
   * whether an effect is called at all belong to the entry.
   */
  draw(context: CanvasRenderingContext2D, scene: Scene, now: number): boolean
  /**
   * A pointer, in normalized art coordinates against the frame. The values
   * are not clamped and fall outside 0 to 1 when the pointer is off the art.
   * Out of range is a position like any other, and each effect answers it for
   * itself.
   */
  pointer(nx: number, ny: number, kind: 'move' | 'down' | 'leave'): void
  dispose(): void
}

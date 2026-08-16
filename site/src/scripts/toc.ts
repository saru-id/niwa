/* Which section the reader is in.
 *
 * The rule is the one a reader would state: the current section is the last
 * heading that has passed under the bar. Nothing else is a section change —
 * not the largest visible heading, and not the first one intersecting, both
 * of which flicker between two entries while a long section scrolls by.
 *
 * The heading positions are measured once and re-measured only when the
 * layout can have moved, so scrolling itself reads no geometry and the
 * handler does nothing but compare numbers. The work is deferred to an
 * animation frame, so a burst of scroll events settles into one update.
 */

const nav = document.querySelector<HTMLElement>('[data-toc]')
const links = nav === null ? [] : [...nav.querySelectorAll<HTMLAnchorElement>('.toc-link')]

if (links.length > 0) {
  // The bar the headings pass under, plus a little, so a heading counts as
  // reached slightly before it touches the bar rather than after. 52 mirrors
  // FRAME.bar in src/styles/layout.stylex.ts at the default sixteen-pixel
  // rem: importing the module here would inline all of it into every page
  // for one number.
  const BAR = 52 + 24

  const targets = links
    .map((link) => {
      const id = decodeURIComponent(link.hash.slice(1))
      const heading = document.getElementById(id)
      return heading === null ? undefined : { link, heading, top: 0 }
    })
    .filter((entry) => entry !== undefined)

  const measure = () => {
    const offset = window.scrollY
    for (const entry of targets) {
      entry.top = entry.heading.getBoundingClientRect().top + offset
    }
  }

  let current: HTMLAnchorElement | undefined
  const mark = () => {
    const y = window.scrollY + BAR
    let found = targets[0]
    for (const entry of targets) {
      if (entry.top <= y) found = entry
      else break
    }
    // Above the first heading, nothing is lit: the reader is in the page's
    // opening, which the contents do not list.
    const next = window.scrollY < targets[0].top - BAR ? undefined : found.link
    if (next === current) return
    current?.removeAttribute('aria-current')
    next?.setAttribute('aria-current', 'true')
    current = next
  }

  let queued = false
  const update = () => {
    if (queued) return
    queued = true
    requestAnimationFrame(() => {
      queued = false
      mark()
    })
  }

  measure()
  mark()

  addEventListener('scroll', update, { passive: true })
  // A resize re-wraps the article, so every heading is somewhere new.
  addEventListener('resize', () => {
    measure()
    update()
  })
  // Fences and trees settle after the first frame, and images have no fixed
  // height until they arrive. One re-measure at load covers both.
  addEventListener('load', () => {
    measure()
    update()
  })
}

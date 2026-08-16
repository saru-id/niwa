/* The landing's page-load behaviors: the header's scrolled state, the trail's
 * light, and the installer's copy control.
 *
 * All three belong to the page rather than to the scene, so none waits for
 * idle time and none asks about motion. A reader who has turned animation
 * off, or whose browser never reaches an idle moment, still gets a header
 * that knows where the page is and a command that copies.
 *
 * The first two both answer the scroll, so they answer it together: one
 * listener, one animation frame, and every measurement in it taken before
 * anything is written. Two listeners racing to the same frame would read
 * layout the other had just dirtied.
 *
 * The document this reads:
 * - `.site-header` — the fixed header that carries `is-scrolled`.
 * - `[data-trail]` — the nav the light's place is written on.
 * - `[data-trail-stop]` — one link per stop, naming the section it is for.
 * - `[data-install-copy]` — the button whose label answers the reader.
 * - `[data-command]` — the span that shows the command and carries it. The
 *   text and the attribute are one value written twice by the page, and the
 *   script reads the attribute: a displayed command sits next to a prompt,
 *   and reading what is displayed would carry the prompt into the paste.
 */

// The line under the header appears once the page has left the top. Twelve
// pixels is past the drift of a resting finger on a touchpad, so the line
// does not blink while the reader is still.
const SCROLLED_PAST = 12

// Where down the window a section counts as the one being read. Not the top,
// which would hand the next stop the light while its heading was still under
// the header, and not the middle, which holds the light on a section the
// reader has finished. A little above the middle is where a heading has
// arrived and its first paragraph is being read.
const READING_LINE = 0.42

// The air the light carries past each end of the stop it is under, in CSS
// pixels. The stylesheet fades the gradient over exactly this much at each
// end, so the burning middle is the width of the word.
const GLOW_PAD = 8

// How long the label stays on Copied: long enough to read a word, short
// enough that a second press still gets an answer.
const SETTLE_MS = 1600

/** One thing the scroll moves, measured and written once a frame. */
type Mark = () => void

/** Turn the landing's page-load behaviors on. */
export function start(): void {
  const marks = [header(), trail()].filter((mark): mark is Mark => mark !== null)

  if (marks.length > 0) {
    let queued = 0
    const pump = (): void => {
      queued = 0
      for (const mark of marks) mark()
    }

    // A page restored part way down is already scrolled, and the header has
    // to say so before the reader touches anything.
    pump()
    window.addEventListener(
      'scroll',
      () => {
        if (queued === 0) queued = window.requestAnimationFrame(pump)
      },
      { passive: true },
    )
    // A window that changed width moved the stops without moving the page,
    // so the light has to be told where they went.
    window.addEventListener('resize', pump, { passive: true })
  }

  installer()
}

function header(): Mark | null {
  const bar = document.querySelector<HTMLElement>('.site-header')
  if (bar === null) return null

  return () => {
    bar.classList.toggle('is-scrolled', window.scrollY > SCROLLED_PAST)
  }
}

/**
 * The trail's light: which stop the reader is at, and where that stop sits.
 *
 * The stops are read from the document rather than listed here, and each one
 * names its own section, so the page owns the trail and this owns only the
 * light on it. A stop whose section is not on the page is dropped: it can
 * never be current, and keeping it would put the light on a word with
 * nothing under it.
 *
 * Above the first section there is no stop to be at. That is a real state
 * and not a missing one — the reader is in the garden, before the story —
 * and a width of zero is how the trail says it.
 *
 * Below it the light marks the last stop passed, not the section under the
 * reading line, and the page has stretches between stops: the daily loop,
 * the boundary and the way into the documentation are sections the trail
 * does not name. Holding the light on the stop behind them is the trail's
 * own meaning — these are stepping stones, and the lit one is the stone the
 * reader is standing on until they reach the next. The alternative is a
 * light that goes out for a third of the page, which reads as broken rather
 * than as precise.
 */
function trail(): Mark | null {
  const nav = document.querySelector<HTMLElement>('[data-trail]')
  if (nav === null) return null

  const stops: HTMLElement[] = []
  const sections: HTMLElement[] = []

  for (const stop of nav.querySelectorAll<HTMLElement>('[data-trail-stop]')) {
    const section = document.getElementById(stop.dataset.trailStop ?? '')
    if (section === null) continue
    stops.push(stop)
    sections.push(section)
  }

  if (stops.length === 0) return null

  // The last state written, so a frame that changed nothing writes nothing.
  // The width is in it because the stops move when the window does, and a
  // resize that leaves the reader on the same stop still moves the light.
  let at = -2
  let measured = -1

  return () => {
    const height = window.innerHeight
    const scrolled = window.scrollY
    const remaining = Math.max(
      0,
      document.documentElement.scrollHeight - height - scrolled,
    )

    /*
     * The line slides down as the page runs out of scroll.
     *
     * A fixed line assumes there is always more page to bring up to it, and
     * at the end of a document there is not: the last section's top stops
     * short of the line by however much scroll the page is missing, so the
     * stop is never reached. On this page that left the final stop lighting
     * for the last twenty-four pixels of the scroll, which is to say never.
     *
     * With a viewport or more still to go the line is where it was. Inside
     * the last viewport it moves down in step with what is left, and at the
     * very end it is the bottom of the window — which is right, because by
     * then everything the page has left to show is already on screen.
     */
    const line =
      remaining >= height
        ? height * READING_LINE
        : height * READING_LINE + height * (1 - READING_LINE) * (1 - remaining / height)

    let next = -1

    // Every read first. The writes below dirty the layout these depend on.
    for (let index = 0; index < sections.length; index += 1) {
      if (sections[index].getBoundingClientRect().top <= line) next = index
    }

    const width = window.innerWidth
    if (next === at && width === measured) return
    at = next
    measured = width

    for (let index = 0; index < stops.length; index += 1) {
      // `location` is the token for a place within a page, which is what a
      // stop on this trail is. A reader who cannot see the light is told the
      // same thing it says.
      if (index === next) stops[index].setAttribute('aria-current', 'location')
      else stops[index].removeAttribute('aria-current')
    }

    if (next === -1) {
      nav.style.setProperty('--trail-width', '0px')
      return
    }

    const here = stops[next]
    nav.style.setProperty('--trail-x', `${here.offsetLeft - GLOW_PAD}px`)
    nav.style.setProperty('--trail-width', `${here.offsetWidth + GLOW_PAD * 2}px`)
  }
}

function installer(): void {
  const button = document.querySelector<HTMLElement>('[data-install-copy]')
  const command = document.querySelector<HTMLElement>('[data-command]')
  if (button === null || command === null) return

  // The button's name never moves: the changing word is a span a screen
  // reader does not see, and the outcome lands in the status region beside
  // the control, which is how it is announced without taking focus.
  const label = document.querySelector<HTMLElement>('[data-install-label]') ?? button
  const status = document.querySelector<HTMLElement>('[data-install-status]')

  // The restore is owned rather than left running, so the label never has two
  // futures at once: a second press starts its own full window, and a press
  // that ends in Select is not put back to Copy by an earlier one.
  let settling = 0

  const say = (word: string): void => {
    window.clearTimeout(settling)
    label.textContent = word
    if (status !== null) status.textContent = word
    settling = window.setTimeout(() => {
      settling = 0
      label.textContent = 'Copy'
      // Emptied, so the next outcome is a change to announce even when it
      // is the same word as the last one.
      if (status !== null) status.textContent = ''
    }, SETTLE_MS)
  }

  /* Nothing reached the clipboard, so the command is offered a second way:
   * selected on the page, ready for the reader's own copy. The selection
   * covers the command alone. The prompt beside it is punctuation, and a
   * paste that begins with it is a paste that fails.
   *
   * The label stays on Select. The selection stays on the page too, so the
   * offer is still true a minute later. */
  const select = (): void => {
    window.clearTimeout(settling)
    settling = 0
    label.textContent = 'Select'
    if (status !== null) status.textContent = 'Copy failed'
    const selection = window.getSelection()
    if (selection === null) return
    const range = document.createRange()
    range.selectNodeContents(command)
    selection.removeAllRanges()
    selection.addRange(range)
  }

  button.addEventListener('click', () => {
    // Off a secure context there is no clipboard at all, an old one may carry
    // no writer, and a whole one can still refuse. All three end with nothing
    // copied, and the reader is told the same thing.
    const written = navigator.clipboard?.writeText?.(command.dataset.command ?? '')
    if (written === undefined) {
      select()
      return
    }
    void written.then(() => {
      say('Copied')
    }, select)
  })
}

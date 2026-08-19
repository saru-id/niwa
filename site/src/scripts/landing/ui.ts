/* The landing's page-load behaviors: the header's scrolled state, the trail's
 * sprout, the write-back demonstration, and the installer's copy control.
 *
 * All three belong to the page rather than to the scene, so none waits for
 * idle time. A reader who has turned animation off, or whose browser never
 * reaches an idle moment, still gets a header that knows where the page is
 * and a command that copies; the write-back proof asks about motion at each
 * pull, so a setting changed mid-visit is honoured by the next press.
 *
 * The first two both answer the scroll, so they answer it together: one
 * listener, one animation frame, and every measurement in it taken before
 * anything is written. Two listeners racing to the same frame would read
 * layout the other had just dirtied.
 *
 * The document this reads:
 * - `.site-header` — the fixed header that carries `is-scrolled`.
 * - `[data-trail]` — the nav that owns the current-section state.
 * - `[data-trail-sprout]` — the marker whose position is written.
 * - `[data-trail-stop]` — one link per stop, naming the section it is for.
 * - `[data-install-copy]` — the button whose label answers the reader.
 * - `[data-command]` — the span that shows the command and carries it. The
 *   text and the attribute are one value written twice by the page, and the
 *   script reads the attribute: a displayed command sits next to a prompt,
 *   and reading what is displayed would carry the prompt into the paste.
 * - `[data-writeback-demo]` — the machine-to-config demonstration.
 * - `[data-writeback-toggle]` — the Dock state on the illustrated machine.
 * - `[data-writeback-pull]` — the deliberate step that brings it home.
 * - `[data-writeback-value]` — the Luau literal that follows the machine.
 * - `[data-writeback-status]` — the same difference said without colour.
 * - `[data-writeback-announce]` — where a change of that difference is
 *   announced, outside the button so announcing it renames nothing.
 */

// The line under the header appears once the page has left the top. Twelve
// pixels is past the drift of a resting finger on a touchpad, so the line
// does not blink while the reader is still.
const SCROLLED_PAST = 12

// Where down the window a section counts as the one being read. Not the top,
// which would hand the next stop the sprout while its heading was still under
// the header, and not the middle, which holds the sprout on a section the
// reader has finished. A little above the middle is where a heading has
// arrived and its first paragraph is being read.
const READING_LINE = 0.42

// The plant gives under the move before it settles. Both phases stay below
// a quarter second so the response reads as material, never as a wait.
const SPROUT_TAKEOFF_MS = 140
const SPROUT_SETTLE_MS = 240
const SPROUT_REST = 'translate3d(0, 0, 0) skewX(0deg) rotate(0deg) scaleX(1)'
const SPROUT_RIGHT =
  'translate3d(0, 0, 0) skewX(-0.8deg) rotate(0.65deg) scaleX(0.996)'
const SPROUT_LEFT =
  'translate3d(0, 0, 0) skewX(0.8deg) rotate(-0.65deg) scaleX(0.996)'

// How long the label stays on Copied: long enough to read a word, short
// enough that a second press still gets an answer.
const SETTLE_MS = 1600

// A pull is read in three beats: show the proposed edit, let it be understood,
// then let the accepted value take the old value's place. The final DOM swap
// happens just after the visible commit has finished.
const WRITEBACK_COMMIT_MS = 720
const WRITEBACK_SETTLE_MS = 1280

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
    // so the sprout has to be told where they went.
    window.addEventListener('resize', pump, { passive: true })
  }

  writeback()
  installer()
}

/**
 * Let one familiar setting prove the write-back direction.
 *
 * `machine` and `declared` stay separate until the pull button is pressed.
 * That separation is the whole feature being demonstrated: changing a Mac
 * is not the same as changing its config, and niwa never silently pretends it
 * is. A switch that returns to the declared value has no drift, so the pull
 * stands down without needing a special case in the markup.
 */
function writeback(): void {
  const root = document.querySelector<HTMLElement>('[data-writeback-demo]')
  const toggle = document.querySelector<HTMLButtonElement>('[data-writeback-toggle]')
  const pull = document.querySelector<HTMLButtonElement>('[data-writeback-pull]')
  const value = document.querySelector<HTMLElement>('[data-writeback-value]')
  const before = document.querySelector<HTMLElement>('[data-writeback-before]')
  const after = document.querySelector<HTMLElement>('[data-writeback-after]')
  const status = document.querySelector<HTMLElement>('[data-writeback-status]')
  const announce = document.querySelector<HTMLElement>('[data-writeback-announce]')
  if (
    root === null ||
    toggle === null ||
    pull === null ||
    value === null ||
    before === null ||
    after === null ||
    status === null
  ) {
    return
  }

  let machine = toggle.getAttribute('aria-pressed') === 'true'
  let declared = before.textContent?.trim() === 'true'
  let writing = false
  let committing = 0
  let settling = 0
  // What the live region last said, so the load's first render announces
  // nothing: the page opens already saying it.
  let said = status.textContent?.trim() ?? ''

  const render = (): void => {
    const drifted = machine !== declared
    toggle.setAttribute('aria-pressed', String(machine))
    toggle.classList.toggle('is-on', machine)
    toggle.disabled = writing
    // Dimmed, never disabled: the reader's focus is on this control at the
    // very moment it stands down, and a disabled button drops that focus on
    // the floor. The guard at the top of the handler is what makes it true.
    pull.setAttribute('aria-disabled', String(!drifted || writing))
    const word = drifted ? '1 change ready' : 'in sync'
    status.textContent = word
    if (announce !== null && word !== said) {
      said = word
      announce.textContent = word
    }
    root.classList.toggle('is-synced', !drifted)
    value.classList.toggle('is-diffing', false)
    value.classList.toggle('is-committing', false)
    before.textContent = String(declared)
    after.textContent = String(machine)
  }

  toggle.addEventListener('click', () => {
    if (writing) return
    machine = !machine
    render()
  })

  pull.addEventListener('click', () => {
    if (machine === declared || writing) return
    const target = machine

    window.clearTimeout(committing)
    window.clearTimeout(settling)
    root.classList.remove('is-pulling')

    // Asked at the press rather than at load, so a setting changed while the
    // page was open governs this pull, not the one before the change.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false) {
      declared = target
      render()
      return
    }

    // Removing and reading before adding is the intentional restart point for
    // a repeated pull. It dirties one tiny isolated demo, not page layout.
    void root.offsetWidth
    writing = true
    root.classList.add('is-pulling')
    toggle.disabled = true
    pull.setAttribute('aria-disabled', 'true')
    before.textContent = String(declared)
    after.textContent = String(target)
    value.classList.remove('is-resetting')
    value.classList.remove('is-committing')
    value.classList.toggle('is-diffing', true)

    committing = window.setTimeout(() => {
      committing = 0
      value.classList.add('is-committing')
    }, WRITEBACK_COMMIT_MS)

    settling = window.setTimeout(() => {
      value.classList.add('is-resetting')
      declared = target
      writing = false
      settling = 0
      root.classList.remove('is-pulling')
      render()
      // The visible `true` is already in its final position. Replace the DOM
      // value while transitions are paused, then restore them for the next pull.
      void value.offsetWidth
      value.classList.remove('is-resetting')
    }, WRITEBACK_SETTLE_MS)
  })

  render()
}

function header(): Mark | null {
  const bar = document.querySelector<HTMLElement>('.site-header')
  if (bar === null) return null

  return () => {
    bar.classList.toggle('is-scrolled', window.scrollY > SCROLLED_PAST)
  }
}

/**
 * The trail's sprout: which stop the reader is at, and where that stop sits.
 *
 * The stops are read from the document rather than listed here, and each one
 * names its own section, so the page owns the trail and this owns only the
 * marker on it. A stop whose section is not on the page is dropped: it can
 * never be current, and keeping it would put the marker on a word with
 * nothing under it.
 *
 * Above the first section there is no stop to be at. That is a real state
 * and not a missing one — the reader is in the garden, before the story —
 * and the closed plant is how the trail says it.
 *
 * Below it the sprout marks the last stop passed, not the section under the
 * reading line, and the page still has stretches between stops. Holding the
 * sprout on the stop behind them is the trail's own meaning — these are stepping stones, and the marked one is the stone the
 * reader is standing on until they reach the next. The alternative is a
 * marker that disappears for a third of the page, which reads as broken rather
 * than as precise.
 */
function trail(): Mark | null {
  const nav = document.querySelector<HTMLElement>('[data-trail]')
  const sprout = document.querySelector<HTMLElement>('[data-trail-sprout]')
  const body = document.querySelector<SVGGraphicsElement>('[data-trail-sprout-body]')
  if (nav === null || sprout === null || body === null) return null

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
  // resize that leaves the reader on the same stop still moves the sprout.
  let at = -2
  let measured = -1
  let position: number | undefined
  let settleTimer: number | undefined

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
     * stop is never reached. On this page that left the final stop unmarked
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

    const changedStop = next !== at
    let x: number | undefined
    if (next !== -1) {
      const here = stops[next]
      const trailBox = nav.getBoundingClientRect()
      const stopBox = here.getBoundingClientRect()
      x = stopBox.left - trailBox.left + (stopBox.width - sprout.offsetWidth) / 2
    }

    const direction =
      changedStop && position !== undefined && x !== undefined ? Math.sign(x - position) : 0

    at = next
    measured = width

    for (let index = 0; index < stops.length; index += 1) {
      // `location` is the token for a place within a page, which is what a
      // stop on this trail is. A reader who cannot see the sprout is told the
      // same thing it says.
      if (index === next) stops[index].setAttribute('aria-current', 'location')
      else stops[index].removeAttribute('aria-current')
    }

    nav.classList.toggle('has-current', next !== -1)
    if (x !== undefined) {
      sprout.style.setProperty('transform', `translate3d(${x}px, 0, 0)`)

      if (direction !== 0) {
        if (settleTimer !== undefined) window.clearTimeout(settleTimer)
        body.style.setProperty('transition-duration', `${SPROUT_TAKEOFF_MS}ms`)
        body.style.setProperty('transform', direction > 0 ? SPROUT_RIGHT : SPROUT_LEFT)
        settleTimer = window.setTimeout(() => {
          settleTimer = undefined
          body.style.setProperty('transition-duration', `${SPROUT_SETTLE_MS}ms`)
          body.style.setProperty('transform', SPROUT_REST)
        }, SPROUT_TAKEOFF_MS)
      }

      position = x
    } else {
      // Returning to the garden closes the plant. Its next appearance is a
      // fresh growth, not a remembered trip back from the last word.
      if (settleTimer !== undefined) window.clearTimeout(settleTimer)
      settleTimer = undefined
      if (position !== undefined) {
        body.style.setProperty('transition-duration', `${SPROUT_SETTLE_MS}ms`)
        body.style.setProperty('transform', SPROUT_REST)
      }
      position = undefined
    }
  }
}

function installer(): void {
  const button = document.querySelector<HTMLElement>('[data-install-copy]')
  const command = document.querySelector<HTMLElement>('[data-command]')
  if (button === null || command === null) return

  // The button's name holds still through the transient words: the changing
  // word is a span a screen reader does not see, and the outcome lands in
  // the status region beside the control, which is how it is announced
  // without taking focus. Only Select, the word that settles and stays,
  // becomes the name too — a control whose visible word and spoken name
  // disagree is unreachable by the reader who repeats what they see.
  const label = document.querySelector<HTMLElement>('[data-install-label]') ?? button
  const status = document.querySelector<HTMLElement>('[data-install-status]')

  // The restore is owned rather than left running, so the label never has two
  // futures at once: a second press starts its own full window, and a press
  // that ends in Select is not put back to Copy by an earlier one.
  let settling = 0

  const say = (word: string): void => {
    window.clearTimeout(settling)
    button.setAttribute('aria-label', 'Copy')
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
    button.setAttribute('aria-label', 'Select')
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

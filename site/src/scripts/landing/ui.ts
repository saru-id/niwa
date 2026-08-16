/* The landing's two page-load behaviors: the header's scrolled state, and the
 * installer's copy control.
 *
 * Both belong to the page rather than to the scene, so neither waits for idle
 * time and neither asks about motion. A reader who has turned animation off,
 * or whose browser never reaches an idle moment, still gets a header that
 * knows where the page is and a command that copies.
 *
 * The document this reads:
 * - `.site-header` — the fixed header that carries `is-scrolled`.
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

// How long the label stays on Copied: long enough to read a word, short
// enough that a second press still gets an answer.
const SETTLE_MS = 1600

/** Turn the landing's page-load behaviors on. */
export function start(): void {
  header()
  installer()
}

function header(): void {
  const bar = document.querySelector<HTMLElement>('.site-header')
  if (bar === null) return

  let queued = 0
  const mark = (): void => {
    queued = 0
    bar.classList.toggle('is-scrolled', window.scrollY > SCROLLED_PAST)
  }

  // A page restored part way down is already scrolled, and the header has to
  // say so before the reader touches anything.
  mark()
  window.addEventListener(
    'scroll',
    () => {
      if (queued === 0) queued = window.requestAnimationFrame(mark)
    },
    { passive: true },
  )
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

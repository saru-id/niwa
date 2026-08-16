// One delegated listener for every copy control on the page. The control
// carries no payload: the text is the code block it sits in, so the page
// never ships a second copy of the snippet.

// A page loads this file for its effect and imports nothing from it. The
// empty export is what makes it a module, so the names below stay its own.
export {}

// The word stays for 1.5 seconds. That is long enough to read four letters
// and short enough that a second copy still gets an answer.
const SETTLE_MS = 1500

// Each control owns its one pending restore. A second press inside the
// window would otherwise inherit the first press's timer and lose half its
// own; clearing before scheduling gives every outcome a full window.
const settling = new WeakMap<Element, ReturnType<typeof setTimeout>>()

/** Say what happened, then go back to the offer. */
function say(label: Element, status: Element | null, word: string): void {
  clearTimeout(settling.get(label))
  label.textContent = word
  // The button is named once and keeps that name, so the word a screen
  // reader hears comes from the region beside it and not from the label.
  if (status !== null) status.textContent = word
  settling.set(
    label,
    setTimeout(() => {
      settling.delete(label)
      label.textContent = 'Copy'
      // Emptied, so the next outcome is a change to announce even when it is
      // the same word as the last one.
      if (status !== null) status.textContent = ''
    }, SETTLE_MS),
  )
}

document.addEventListener('click', (event) => {
  const target = event.target
  if (!(target instanceof Element)) return

  const control = target.closest('[data-copy]')
  if (!(control instanceof HTMLElement)) return

  const block = control.closest('[data-code-block]')
  if (block === null) return

  const code = block.querySelector('code')
  if (!code) return

  const label = control.querySelector('[data-copy-label]') ?? control
  const status = block.querySelector('[data-copy-status]')

  // Off a secure context the clipboard is not there at all, and where it is
  // there the write can still be refused. Both end with nothing on the
  // clipboard, so both say so.
  const written = navigator.clipboard?.writeText(code.textContent ?? '')
  if (written === undefined) {
    say(label, status, 'Copy failed')
    return
  }
  void written.then(
    () => {
      say(label, status, 'Copied')
    },
    () => {
      say(label, status, 'Copy failed')
    },
  )
})

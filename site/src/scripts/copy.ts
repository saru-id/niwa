// One delegated listener for every copy control on the page. The control
// carries no payload: the text is the code block it sits in, so the page
// never ships a second copy of the snippet.

// The label stays changed for 1.5 seconds. That is long enough to read four
// letters and short enough that a second copy still gets an answer.
const SETTLE_MS = 1500

/** Say what happened, then go back to the offer. */
function say(label: Element, word: string): void {
  label.textContent = word
  setTimeout(() => {
    label.textContent = 'Copy'
  }, SETTLE_MS)
}

document.addEventListener('click', (event) => {
  const target = event.target
  if (!(target instanceof Element)) return

  const control = target.closest('[data-copy]')
  if (!(control instanceof HTMLElement)) return

  const code = control.closest('[data-code-block]')?.querySelector('code')
  if (!code) return

  const label = control.querySelector('[data-copy-label]') ?? control

  // Off a secure context the clipboard is not there at all, and where it is
  // there the write can still be refused. Both end with nothing on the
  // clipboard, so both say so.
  const written = navigator.clipboard?.writeText(code.textContent ?? '')
  if (written === undefined) {
    say(label, 'Copy failed')
    return
  }
  void written.then(
    () => {
      say(label, 'Copied')
    },
    () => {
      say(label, 'Copy failed')
    },
  )
})

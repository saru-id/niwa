// One delegated listener for every copy control on the page. The control
// carries no payload: the text is the code block it sits in, so the page
// never ships a second copy of the snippet.

// The label stays changed for 1.5 seconds. That is long enough to read four
// letters and short enough that a second copy still gets an answer.
const SETTLE_MS = 1500

document.addEventListener('click', (event) => {
  const target = event.target
  if (!(target instanceof Element)) return

  const control = target.closest('[data-copy]')
  if (!(control instanceof HTMLElement)) return

  const code = control.closest('[data-code-block]')?.querySelector('code')
  if (!code) return

  void navigator.clipboard.writeText(code.textContent ?? '').then(() => {
    control.textContent = 'copied'
    setTimeout(() => {
      control.textContent = 'copy'
    }, SETTLE_MS)
  })
})

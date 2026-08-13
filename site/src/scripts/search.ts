/* The two ways into the search dialog, and the moment its code arrives.
 *
 * The dialog is Pagefind's and opens itself; this says when, and fetches the
 * runtime and stylesheet the build wrote beside the index. Loading them on
 * the first open rather than on every page keeps a reader who never searches
 * at zero bytes. The stylesheet is awaited so the dialog is never shown
 * unstyled; the runtime is awaited through the element definition, which is
 * also what covers a reader who presses the key before the load finishes.
 *
 * The key is command-K because niwa is a macOS tool and that is the key its
 * readers reach for. Control-K answers the same intent on a keyboard with no
 * command key.
 */

interface Modal extends HTMLElement {
  open?: () => void
}

let ready: Promise<void> | undefined

function bundlePath(): string {
  return document.querySelector('pagefind-config')?.getAttribute('bundle-path') ?? '/pagefind/'
}

async function load(): Promise<void> {
  const base = bundlePath()

  const style = document.createElement('link')
  style.rel = 'stylesheet'
  style.href = `${base}pagefind-component-ui.css`
  // A missing stylesheet is a build that has not run yet. Opening a plain
  // dialog says more than opening nothing.
  const styled = new Promise<void>((resolve) => {
    style.addEventListener('load', () => resolve())
    style.addEventListener('error', () => resolve())
  })

  const runtime = document.createElement('script')
  runtime.type = 'module'
  runtime.src = `${base}pagefind-component-ui.js`

  document.head.append(style, runtime)

  await styled
  await customElements.whenDefined('pagefind-modal')
}

async function open(): Promise<void> {
  ready ??= load()
  await ready
  document.querySelector<Modal>('pagefind-modal')?.open?.()
}

document.querySelector('[data-search-open]')?.addEventListener('click', () => {
  void open()
})

document.addEventListener('keydown', (event) => {
  // An uppercase K means shift was held, which is a different shortcut.
  if (event.key !== 'k' || !(event.metaKey || event.ctrlKey)) return
  event.preventDefault()
  void open()
})

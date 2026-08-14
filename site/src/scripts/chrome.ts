/* The three things in the chrome that need a script.
 *
 * The bar and the rail are finished HTML: the links work, the current page
 * is marked, and the colour mode is already showing the right icon before
 * any of this runs. What is added here is the mode control's press, the
 * drawer, and the rail's memory of where it was scrolled to.
 *
 * The rail's scroll position is restored by an inline script beside the
 * element itself, because a restore that waits for a module is a restore
 * the reader watches happen. This file only records the position.
 */

import { recall, remember, show, type Choice } from './theme'

/* ---- The colour mode --------------------------------------------------
 * Two states in one control. The icon says which mode is on and pressing it
 * goes to the other; which icon shows is decided by the stylesheet off the
 * class on `<html>`, so it is right before this runs.
 */

const NEXT: Record<Choice, Choice> = { light: 'dark', dark: 'light' }
const NAME: Record<Choice, string> = { light: 'light', dark: 'dark' }

function label(choice: Choice): string {
  return `Colour mode: ${NAME[choice]}. Switch to ${NAME[NEXT[choice]]}.`
}

for (const control of document.querySelectorAll<HTMLElement>('[data-theme-control]')) {
  const describe = (choice: Choice) => {
    control.setAttribute('aria-label', label(choice))
    control.title = `Colour mode: ${NAME[choice]}`
    const text = control.querySelector('[data-theme-label]')
    if (text) text.textContent = label(choice)
  }

  describe(recall())

  control.addEventListener('click', () => {
    const next = NEXT[recall()]
    remember(next)
    show(next)
    // Every control on the page says the same thing, and there are two of
    // them while the drawer is open.
    for (const other of document.querySelectorAll<HTMLElement>('[data-theme-control]')) {
      other.setAttribute('aria-label', label(next))
      other.title = `Colour mode: ${NAME[next]}`
      const text = other.querySelector('[data-theme-label]')
      if (text) text.textContent = label(next)
    }
  })
}

/* ---- The drawer -------------------------------------------------------
 * A native dialog. `showModal` supplies the focus trap, the Escape key and
 * the scrim, so none of them are written here.
 */

const drawer = document.querySelector<HTMLDialogElement>('[data-drawer]')

if (drawer) {
  for (const button of document.querySelectorAll('[data-drawer-open]')) {
    button.addEventListener('click', () => {
      drawer.showModal()
    })
  }

  for (const button of drawer.querySelectorAll('[data-drawer-close]')) {
    button.addEventListener('click', () => {
      drawer.close()
    })
  }

  // A press on the scrim is a press outside the panel, and the dialog is
  // the full height of the window, so anything outside its box is scrim.
  drawer.addEventListener('click', (event) => {
    const box = drawer.getBoundingClientRect()
    const outside =
      event.clientX < box.left ||
      event.clientX > box.right ||
      event.clientY < box.top ||
      event.clientY > box.bottom
    if (outside) drawer.close()
  })

  // Following a link inside the drawer loads a new page, and the drawer
  // must not be the last thing the reader saw of the old one.
  drawer.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('a[href]')) drawer.close()
  })
}

/* ---- The rail's place -------------------------------------------------
 * Recorded on the way out, restored on the way in by the inline script in
 * the layout. `pagehide` fires on a real navigation and on a tab closing,
 * where `beforeunload` is unreliable and costs the back/forward cache.
 */

const RAIL_KEY = 'niwa-rail-scroll'

addEventListener('pagehide', () => {
  const rail = document.querySelector<HTMLElement>('[data-rail]:not([data-rail-drawer])')
  if (!rail) return
  try {
    sessionStorage.setItem(RAIL_KEY, String(rail.scrollTop))
  } catch {
    // Private modes refuse storage. The rail opens at the current page
    // instead, which is where the inline script puts it with nothing stored.
  }
})

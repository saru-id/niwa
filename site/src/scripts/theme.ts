/* The theme control's three states, as a module the control imports.
 *
 * No class on <html> means follow the system; `theme-light` and `theme-dark`
 * are explicit overrides. System removes the stored key, so the reader who
 * goes back to it follows a later platform change again.
 *
 * The same choice is written a second time, as `data-theme` on the same
 * element. That is the attribute the design system reads to resolve its
 * `light-dark()` tokens, and system is its absence, exactly as here. One
 * control, one stored value, two spellings of it.
 *
 * The blocking script in the head sets both before the first paint. This
 * file only makes the buttons work, so it declares no listeners of its own:
 * the control calls `remember` and `show` together.
 */

export type Choice = 'system' | 'light' | 'dark'

const KEY = 'niwa-theme'

export function remember(choice: Choice): void {
  try {
    if (choice === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, choice)
  } catch {
    // Private modes refuse storage. The choice still holds for this page.
  }
}

export function recall(): Choice {
  try {
    const stored = localStorage.getItem(KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // Same refusal. Following the system is the honest answer.
  }
  return 'system'
}

export function show(choice: Choice): void {
  const root = document.documentElement
  root.classList.toggle('theme-light', choice === 'light')
  root.classList.toggle('theme-dark', choice === 'dark')
  if (choice === 'light' || choice === 'dark') root.setAttribute('data-theme', choice)
  else root.removeAttribute('data-theme')
}

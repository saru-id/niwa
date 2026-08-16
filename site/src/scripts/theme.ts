/* The colour mode: two states, and the control moves between them.
 *
 * There was a third, System, which followed the platform. It is gone. A
 * reader who wants the platform's choice already has it — the blocking
 * script in the head reads `prefers-color-scheme` the first time and lands
 * on the mode that matches — so the third state bought nothing but a third
 * press to cycle past and an icon that named a setting rather than a
 * colour. What it cost was a control that could not be read at a glance:
 * two of its three faces looked the same on a dark platform.
 *
 * So a page always carries `theme-light` or `theme-dark` on `<html>`. That
 * class is the whole switch: one stored value, one spelling of it.
 *
 * A reader with no script has no class at all, and `app.css` still answers
 * `prefers-color-scheme` for exactly that case.
 */

export type Choice = 'light' | 'dark'

const KEY = 'niwa-theme'

/** What the platform asks for, when the reader has not said. */
export function platform(): Choice {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

export function remember(choice: Choice): void {
  try {
    localStorage.setItem(KEY, choice)
  } catch {
    // Private modes refuse storage. The choice still holds for this page.
  }
}

export function recall(): Choice {
  try {
    const stored = localStorage.getItem(KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // Same refusal. The platform's answer is the honest fallback.
  }
  return platform()
}

export function show(choice: Choice): void {
  const root = document.documentElement
  root.classList.toggle('theme-light', choice === 'light')
  root.classList.toggle('theme-dark', choice === 'dark')
}

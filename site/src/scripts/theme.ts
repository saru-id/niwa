/* The theme control's three states.
 *
 * No class on <html> means follow the system; `theme-light` and `theme-dark`
 * are explicit overrides. System removes the stored key, so the reader who
 * goes back to it follows a later platform change again.
 *
 * The blocking script in the head sets the class before the first paint.
 * This file only makes the buttons work.
 */

const KEY = 'niwa-theme'
const buttons = document.querySelectorAll<HTMLButtonElement>('[data-theme-choice]')

function remember(choice: string): void {
  try {
    if (choice === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, choice)
  } catch {
    // Private modes refuse storage. The choice still holds for this page.
  }
}

function recall(): string {
  try {
    const stored = localStorage.getItem(KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // Same refusal. Following the system is the honest answer.
  }
  return 'system'
}

function show(choice: string): void {
  const root = document.documentElement
  root.classList.toggle('theme-light', choice === 'light')
  root.classList.toggle('theme-dark', choice === 'dark')
  for (const button of buttons) {
    button.setAttribute('aria-pressed', String(button.dataset.themeChoice === choice))
  }
}

for (const button of buttons) {
  button.addEventListener('click', () => {
    const choice = button.dataset.themeChoice ?? 'system'
    remember(choice)
    show(choice)
  })
}

show(recall())

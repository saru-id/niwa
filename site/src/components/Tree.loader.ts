/* Loads the tree's renderer when a tree approaches the viewport.
 *
 * The vanilla renderer is the page's single largest script by far, and a
 * server-rendered tree is already complete and readable without it. A
 * reader who never reaches the tree never fetches it; the margin below
 * starts the fetch a screen early, so the first tap on a folder finds the
 * renderer already there.
 */

const trees = document.querySelectorAll('[data-tree]')

/* The tree renders in a shadow root, where the page's one motion rule
 * cannot reach: `*` does not cross the boundary, and the library fades
 * its indent guides over 150ms. The site's budget is 120ms, and reduced
 * motion means none. This sheet holds the vendored component to both. */
const MOTION = `
* { transition-duration: 120ms !important }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
  }
}`

for (const tree of trees) {
  const root = tree.querySelector('file-tree-container')?.shadowRoot
  if (root) {
    const sheet = new CSSStyleSheet()
    sheet.replaceSync(MOTION)
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet]
  }
}

if (trees.length > 0) {
  const observer = new IntersectionObserver(
    (entries, self) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        self.disconnect()
        void import('./Tree.client')
      }
    },
    { rootMargin: '100% 0px' },
  )
  for (const tree of trees) {
    observer.observe(tree)
  }
}

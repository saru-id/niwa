/* Loads the tree's renderer when a tree approaches the viewport.
 *
 * The vanilla renderer is the page's single largest script by far, and a
 * server-rendered tree is already complete and readable without it. A
 * reader who never reaches the tree never fetches it; the margin below
 * starts the fetch a screen early, so the first tap on a folder finds the
 * renderer already there.
 */

const trees = document.querySelectorAll('[data-tree]')

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

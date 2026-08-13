/* The table of contents follows the reader.
 *
 * The list is server rendered, so this file only marks the place: it sets
 * `aria-current` on the entry whose heading is inside the band, and the
 * stylesheet does the rest. One observer, no scroll handler.
 */

const links = new Map<string, Element>()
for (const link of document.querySelectorAll('[data-toc] a[href^="#"]')) {
  const id = decodeURIComponent(link.getAttribute('href')?.slice(1) ?? '')
  if (id !== '') links.set(id, link)
}

const order = [...links.keys()]
const inside = new Set<string>()

const observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) inside.add(entry.target.id)
      else inside.delete(entry.target.id)
    }
    const active = order.find((id) => inside.has(id))
    for (const [id, link] of links) {
      if (id === active) link.setAttribute('aria-current', 'true')
      else link.removeAttribute('aria-current')
    }
  },
  // The band runs from five to twenty percent down the viewport: a heading
  // is current from the moment it reaches the reading line until the next
  // one takes its place.
  { rootMargin: '-5% 0px -80% 0px' },
)

for (const id of order) {
  const heading = document.getElementById(id)
  if (heading !== null) observer.observe(heading)
}

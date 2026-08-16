/* The chrome's icons, as markup.
 *
 * The chrome is plain Astro components that emit HTML and hydrate nothing,
 * so it needs markup rather than a component. Every icon here is drawn on
 * the same 24-unit grid with the same 2-unit stroke, so a reader sees one
 * icon set.
 *
 * `currentColor` and the size the stylesheet gives them mean each one takes
 * its ink and its size from the control it sits in.
 */

const open = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">`

/** Search: a lens and its handle. */
export const SEARCH = `${open}<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>`

/** Light: a disc with eight rays. */
export const SUN = `${open}<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`

/** Dark: the crescent a disc leaves when another passes it. */
export const MOON = `${open}<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>`

/** The drawer's handle: three rules, the shape every drawer is opened by. */
export const MENU = `${open}<path d="M3 6h18M3 12h18M3 18h18"/></svg>`

/** Close, for the drawer's own corner. */
export const CLOSE = `${open}<path d="M18 6 6 18M6 6l12 12"/></svg>`

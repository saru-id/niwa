/* The interface icons the site draws for itself.
 *
 * The three colour modes, and a magnifier.
 *
 * The design system's icon registry carries interface icons — search, menu,
 * chevrons — and no sun, moon or display, so these three are authored here.
 * They are plain geometry at the same 24-unit grid and the same 2-unit
 * stroke as the registry's own, so a reader sees one icon set.
 *
 * `currentColor` and `1em` mean a segment sizes and colours them from the
 * type around it, the way the vendored brand mark does.
 */

const shared = {
  'aria-hidden': true,
  fill: 'none',
  focusable: false,
  height: '1em',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  strokeWidth: 2,
  viewBox: '0 0 24 24',
  width: '1em',
  xmlns: 'http://www.w3.org/2000/svg',
} as const

/** Light: a disc with eight rays. */
export function SunIcon() {
  return (
    <svg {...shared}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  )
}

/** Dark: the crescent a disc leaves when another passes it. */
export function MoonIcon() {
  return (
    <svg {...shared}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  )
}

/** System: a display, because the system is the machine's own choice. */
export function DisplayIcon() {
  return (
    <svg {...shared}>
      <rect x="2" y="4" width="20" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  )
}

/** Search: a lens and its handle. The registry names one, but a semantic
 * name only resolves through a theme that registers an icon set, and this
 * theme registers none — an unresolved name renders as its own text. */
export function SearchIcon() {
  return (
    <svg {...shared}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.6-3.6" />
    </svg>
  )
}

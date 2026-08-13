import * as stylex from '@stylexjs/stylex'

/* The shell's own arithmetic. Everything else is a component prop.
 *
 * The three regions are budgeted in pixels before anything is written into
 * them: the navigation column is the design system's own 260, the reading
 * column is 44rem, and the table of contents is 13rem. The reading column
 * and the rail beside it are centred together inside whatever the
 * navigation column leaves.
 */

export const styles = stylex.create({
  // The reading column and the table of contents, centred as a pair.
  body: {
    marginInline: 'auto',
    maxWidth: 'calc(44rem + 3.5rem + 13rem)',
    width: '100%',
  },
  // A page that renders no rail keeps its own bands, so the shell adds no
  // column of its own and lets the page run the width it was drawn for.
  bare: {
    width: '100%',
  },
  column: {
    minWidth: 0,
  },
  // The last thing to appear and the first thing to go. Its content is not
  // repeated anywhere, so nothing is lost when it goes.
  outline: {
    alignSelf: 'start',
    display: { default: 'none', '@media (min-width: 1280px)': 'block' },
    // 13rem is the budget, and the reading column gives way first: without
    // this the rail is the flex item that loses, and it loses all of it.
    flexShrink: 0,
    insetBlockStart: 'var(--header-height)',
    maxHeight: 'calc(100dvh - var(--header-height))',
    overflowY: 'auto',
    position: 'sticky',
    width: '13rem',
  },
  // One number decides the header's height, the two rails' sticky top, and
  // the room a heading jumped to has to clear. The shell measures its own
  // header and would have set a second number beside that one, so the bar
  // is pinned to the number the site already has.
  bar: {
    minHeight: 'var(--header-height)',
  },
  // A touch device has no command key, so the hint is not shown there.
  kbd: {
    display: { default: 'none', '@media (min-width: 640px)': 'inline-flex' },
  },
  // The theme control and the repository link ride in the bar while there
  // is room for them, and in the drawer below the breakpoint where the bar
  // holds the wordmark, search and the drawer's own button. The rule is CSS
  // and not a media query read in script, so the bar is the right width in
  // the HTML, before anything runs.
  wideOnly: {
    display: { default: 'none', '@media (min-width: 769px)': 'flex' },
  },
  // The same two, at the foot of the drawer.
  drawerControls: {
    borderBlockStartColor: 'var(--border)',
    borderBlockStartStyle: 'solid',
    borderBlockStartWidth: '1px',
    marginBlockStart: 'var(--spacing-4)',
    paddingBlockStart: 'var(--spacing-4)',
  },
  // Lowercase, because that is what the command is called.
  wordmark: {
    fontFamily: 'var(--font-mono)',
    fontSize: '1rem',
    fontWeight: 600,
    letterSpacing: '-0.01em',
  },
  // The navigation a reader with no script is given, below the shell. It is
  // inside a `<noscript>`, so with a script it is not in the document at
  // all and there is never a second navigation landmark.
  fallback: {
    borderBlockStartColor: 'var(--border)',
    borderBlockStartStyle: 'solid',
    borderBlockStartWidth: '1px',
    paddingBlock: 'var(--spacing-4)',
    paddingInline: 'var(--spacing-5)',
  },
  // A page with a rail has one above the breakpoint, so the fallback only
  // stands in below it. A page without a rail keeps the fallback at every
  // width, because nothing else there navigates.
  fallbackWithRail: {
    display: { default: 'block', '@media (min-width: 769px)': 'none' },
  },
})

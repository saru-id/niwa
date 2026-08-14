import * as stylex from '@stylexjs/stylex'

/* The shell's own arithmetic. Everything else is a component prop.
 *
 * The frame is budgeted in pixels before anything is written into it. The
 * design system owns the navigation column, which is its own 260; these are
 * the two numbers beside it.
 *
 * READING is the measure. 720 pixels of the system sans at 16px is about
 * ninety characters on the longest line of `/concepts/model`, counted
 * character by character; ninety is the top of what one column of running
 * text can hold. It is also the width the rest of an article wants, because
 * a fence, a screen, a table and a tree share this column, and everything in
 * an article ends at this one right edge.
 *
 * ROW is that column, the table of contents, and the air around both. It is
 * the number `Layout` takes: `contentWidth` caps the whole start|content|end
 * row, not the content alone. So the reading column carries a cap of its own
 * as well, for the widths below 1280 where the table of contents is gone and
 * the row would hand the column everything it has.
 *
 *     32  +   720   +  32 | 32 +    192   +  32
 *    air     reading   air  air  contents   air
 *     \_________________/    \_______________/
 *            784                    256
 *     \_______________________________________/
 *                       1040
 *
 * 32 is spacing step 8, the one step both slots are given.
 */
export const FRAME = {
  /** `Layout contentWidth`: the reading column and the contents, centred. */
  row: 1040,
  /** The reading column's own cap, its air included. */
  reading: 784,
  /** `LayoutPanel width` for the table of contents, its air included. */
  outline: 256,
  /** The spacing step both slots carry. */
  padding: 8,
} as const

export const styles = stylex.create({
  // The reading column. `Layout` centres the row; this centres the column
  // inside whatever the row gives it once the contents are gone.
  //
  // A slot publishes its own padding so that dense data can bleed back out
  // to the slot's edges, which is right for a table that is the page. In an
  // article a table is one block among fences, screens and trees, and they
  // all end where the prose ends. So the column publishes nothing to bleed
  // into, and the table keeps the cell padding it falls back to.
  reading: {
    '--container-padding-inline-end': '0px',
    '--container-padding-inline-start': '0px',
    marginInline: 'auto',
    maxWidth: FRAME.reading,
    width: '100%',
  },
  // The last thing to appear and the first thing to go. Its content is not
  // repeated anywhere, so nothing is lost when it goes. Below 1280 the row
  // has no room for both it and the measure, and the measure wins.
  //
  // It follows the reader by sticking, and it does not scroll: on this site
  // the page is the only scroller. A table of contents is a dozen lines, so
  // there is nothing for a second scrollbar to reach.
  outline: {
    alignSelf: 'start',
    display: { default: 'none', '@media (min-width: 1280px)': 'block' },
    insetBlockStart: 'var(--header-height)',
    position: 'sticky',
  },
  // One number decides the header's height, the outline's sticky top, and
  // the room a heading jumped to has to clear. The shell measures its own
  // header and would have set a second number beside that one, so the bar
  // is pinned to the number the site already has.
  bar: {
    minHeight: 'var(--header-height)',
  },
  /* The mark the site opens every page with, at the size of the word beside
   * it. One filled circle in the accent: the whole identity budget the
   * brief gives the chrome, spent in one place. */
  dot: {
    backgroundColor: 'var(--accent)',
    blockSize: '0.5rem',
    borderRadius: '50%',
    display: 'inline-block',
    inlineSize: '0.5rem',
  },
  /* The version, beside the name. It is a fact about what these pages
   * describe, and it belongs where the name is rather than only at the
   * foot of the page. */
  version: {
    color: 'var(--ink-muted)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-kicker)',
  },
  /* The way in to search reads as a field, not as a button: a stated width
   * with the label at one end and the shortcut at the other. A button that
   * says only "Search" is the shape every framework ships by default, and a
   * reader has to guess whether it opens a box or runs one. Below the
   * breakpoint it collapses to its icon, where a fixed width would crowd
   * the wordmark. */
  search: {
    inlineSize: { default: 'auto', '@media (min-width: 769px)': '15rem' },
    justifyContent: 'flex-start',
  },
  // A touch device has no command key, so the hint is not shown there.
  // The shortcut sits at the far end of the field; the magnifier and the
  // word stay together at the near end, the way they do in a real one.
  // The shortcut sits at the far end of the field; the magnifier and the
  // word stay together at the near end, the way they do in a real one. A
  // touch device has no command key, so it is not shown there.
  kbd: {
    alignItems: 'center',
    backgroundColor: 'var(--surface)',
    borderRadius: 'var(--radius-inner)',
    color: 'var(--ink-muted)',
    display: { default: 'none', '@media (min-width: 640px)': 'inline-flex' },
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-meta)',
    marginInlineStart: 'auto',
    paddingBlock: '0.1rem',
    paddingInline: 'var(--spacing-1)',
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
  // The vendored mark is drawn at 1em in `currentColor`, so it takes the
  // size and the ink of the label beside it and needs nothing else.
  mark: {
    alignItems: 'center',
    display: 'inline-flex',
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

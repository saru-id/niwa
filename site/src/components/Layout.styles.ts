import * as stylex from '@stylexjs/stylex'

/* The shell's arithmetic, in one place. The three columns and the two gaps
 * add up to the page's maximum width; the outer 2.5rem is the padding either
 * side. Header, content and footer all read `column` so their left edges
 * line up on every page, with a rail or without one.
 */
const MAX_WIDTH = 'calc(15rem + 3.5rem + 44rem + 3.5rem + 13rem + 2.5rem)'

export const styles = stylex.create({
  column: {
    marginInline: 'auto',
    maxWidth: MAX_WIDTH,
    paddingInline: '1.25rem',
    width: '100%',
  },
  page: {
    columnGap: '3.5rem',
    display: 'grid',
    gridTemplateColumns: {
      default: 'minmax(0, 1fr)',
      '@media (min-width: 1024px)': '15rem minmax(0, 44rem)',
    },
    marginInline: 'auto',
    maxWidth: MAX_WIDTH,
    paddingInline: '1.25rem',
    width: '100%',
  },
  // The third column only exists when the page has one. A page without
  // headings keeps the other two where they were.
  pageWithToc: {
    gridTemplateColumns: {
      default: 'minmax(0, 1fr)',
      '@media (min-width: 1024px)': '15rem minmax(0, 44rem)',
      '@media (min-width: 1280px)': '15rem minmax(0, 44rem) 13rem',
    },
  },
  main: {
    minWidth: 0,
    paddingBlock: '2.5rem 4rem',
  },
  // Off screen until focused, and the first thing the keyboard reaches.
  skip: {
    backgroundColor: 'var(--surface)',
    borderColor: 'var(--border)',
    borderRadius: '5px',
    borderStyle: 'solid',
    borderWidth: '1px',
    color: 'var(--link)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-meta)',
    insetBlockStart: { default: '-5rem', ':focus': '0.75rem' },
    insetInlineStart: '0.75rem',
    paddingBlock: '0.5rem',
    paddingInline: '0.75rem',
    position: 'fixed',
    textDecoration: 'none',
    zIndex: 2,
  },
})

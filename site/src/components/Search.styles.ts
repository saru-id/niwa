import * as stylex from '@stylexjs/stylex'

/* The result row, and nothing else.
 *
 * Pagefind's elements set `all: initial`, so the site's cascade stops at
 * their edge. Inside `<script type="text/pagefind-template">` it resumes,
 * which is why these classes reach the rows and no others. The host hands
 * down its own font and 16px, so every row property is stated here rather
 * than inherited.
 */
export const styles = stylex.create({
  // Rows are separated by a hairline, not by a gap and a card each.
  result: {
    borderBlockStartColor: 'var(--border)',
    borderBlockStartStyle: 'solid',
    borderBlockStartWidth: '1px',
    display: 'block',
    ':first-child': { borderBlockStartStyle: 'none' },
  },
  link: {
    alignItems: 'baseline',
    color: { default: 'var(--ink-strong)', ':hover': 'var(--link)' },
    columnGap: '0.75rem',
    display: 'flex',
    flexWrap: 'wrap',
    fontFamily: 'var(--font-sans)',
    fontSize: 'var(--text-nav)',
    fontWeight: 500,
    lineHeight: 1.4,
    paddingBlock: '0.75rem 0.25rem',
    textDecoration: 'none',
    transitionDuration: '120ms',
    transitionProperty: 'color',
    transitionTimingFunction: 'ease',
  },
  // The path is what the reader is choosing between, so it is set in the
  // face niwa prints paths in.
  path: {
    color: 'var(--ink-muted)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-meta)',
    fontWeight: 400,
  },
  excerpt: {
    color: 'var(--ink)',
    fontFamily: 'var(--font-sans)',
    fontSize: 'var(--text-rail)',
    lineHeight: 1.6,
    marginBlock: 0,
    paddingBlockEnd: '0.75rem',
  },
  // The keyboard hints, written here rather than taken from the component.
  // Its own string calls Escape "clear", and Escape closes; it never names
  // Enter at all. Pagefind's elements reset `all`, so the row states its own
  // face, size and ink instead of inheriting them.
  hints: {
    color: 'var(--ink-muted)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-meta)',
    letterSpacing: '0.02em',
    lineHeight: 1.4,
    marginBlock: 0,
  },
  // The row that is not there yet. It holds the height its result will take,
  // so the list does not jump when the excerpt arrives. It does not shimmer:
  // nothing on this site loops.
  placeholder: {
    borderBlockStartColor: 'var(--border)',
    borderBlockStartStyle: 'solid',
    borderBlockStartWidth: '1px',
    display: 'block',
    height: '5.25rem',
    ':first-child': { borderBlockStartStyle: 'none' },
  },
})

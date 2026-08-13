/* The reference pages' furniture.
 *
 * The generated pages build their own headings, tables and lists, so they
 * carry the type scale the markdown renderer applies to written pages. One
 * module, because twenty-nine pages wear the same clothes. The leading
 * underscore keeps Astro from routing this file.
 */

import * as stylex from '@stylexjs/stylex'

export const styles = stylex.create({
  h1: {
    fontSize: 'var(--text-h1)',
    fontWeight: 700,
    letterSpacing: '-0.03em',
    lineHeight: 1.15,
    marginBlock: '0.75rem 0',
    scrollMarginTop: '1.5rem',
    textWrap: 'balance',
  },
  // The line under the h1. It says what the page is; nothing else does.
  deck: {
    color: 'var(--ink-muted)',
    marginBlock: '0.75rem 0',
    maxWidth: 'var(--measure)',
    textWrap: 'pretty',
  },
  // The chapter rule: a full-width hairline above every h2, with air on
  // both sides. It carries most of the hierarchy on these pages.
  h2: {
    borderTopColor: 'var(--border)',
    borderTopStyle: 'solid',
    borderTopWidth: 1,
    fontSize: 'var(--text-h2)',
    fontWeight: 600,
    letterSpacing: '-0.02em',
    lineHeight: 1.2,
    marginBlock: '2.75rem 0',
    paddingBlockStart: '2.25rem',
    scrollMarginTop: '1.5rem',
    textWrap: 'balance',
  },
  h3: {
    fontSize: 'var(--text-h3)',
    fontWeight: 600,
    letterSpacing: '-0.015em',
    lineHeight: 1.3,
    marginBlock: '1.75rem 0',
    scrollMarginTop: '1.5rem',
  },
  p: {
    marginBlock: '1rem',
    maxWidth: 'var(--measure)',
  },
  // A run of entries: each is a name and a line about it, and the list
  // reads down the page rather than across it.
  list: {
    listStyle: 'none',
    marginBlock: '1rem',
    paddingInlineStart: 0,
  },
  item: {
    marginBlock: '0.45rem',
  },
  // The name in an index row, set in mono so the column of verbs aligns.
  name: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-inline-code)',
  },
  said: {
    color: 'var(--ink-muted)',
  },
  code: {
    color: 'var(--th-code-inline)',
    fontSize: 'var(--text-inline-code)',
  },
  // A signature, or the usage line. The frame the site gives code, with
  // the horizontal scroll a long type keeps instead of wrapping.
  signature: {
    backgroundColor: 'var(--surface)',
    borderColor: 'var(--border)',
    borderRadius: 8,
    borderStyle: 'solid',
    borderWidth: 1,
    color: 'var(--th-token)',
    fontSize: 'var(--text-code)',
    lineHeight: 1.6,
    marginBlock: '1rem',
    overflowX: 'auto',
    paddingBlock: '0.75rem',
    paddingInline: '1rem',
    whiteSpace: 'pre',
  },
  // Tables are framed, not striped: a container border, and hairlines
  // under the rows.
  tableFrame: {
    borderColor: 'var(--border)',
    borderRadius: 8,
    borderStyle: 'solid',
    borderWidth: 1,
    marginBlock: '1.5rem',
    overflowX: 'auto',
  },
  table: {
    borderCollapse: 'collapse',
    fontSize: 'var(--text-table)',
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1.55,
    width: '100%',
  },
  th: {
    borderBottomColor: 'var(--border)',
    borderBottomStyle: 'solid',
    borderBottomWidth: 1,
    color: 'var(--ink-muted)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-meta)',
    fontWeight: 500,
    letterSpacing: '0.06em',
    paddingBlock: '0.6rem',
    paddingInline: '1rem',
    textAlign: 'start',
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
  },
  td: {
    borderBottomColor: 'var(--border)',
    borderBottomStyle: 'solid',
    borderBottomWidth: 1,
    paddingBlock: '0.6rem',
    paddingInline: '1rem',
    verticalAlign: 'top',
  },
  // The last row's hairline would double the frame's own line.
  lastRow: {
    borderBottomWidth: 0,
  },
  // Flag names, arguments and exit codes are code, and they never wrap.
  cell: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-inline-code)',
    whiteSpace: 'nowrap',
  },
})

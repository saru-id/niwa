/* The reference pages' furniture.
 *
 * The generated pages build their own headings and lists, so they carry the
 * type scale the markdown renderer applies to written pages. Their tables
 * live in `components/DataTable.tsx`. One module, because twenty-nine pages
 * wear the same clothes. The leading
 * underscore keeps Astro from routing this file.
 */

import * as stylex from '@stylexjs/stylex'

export const styles = stylex.create({
  // The title and the deck are set in `src/styles/type.stylex.ts`, which the
  // written pages read too. What is here is the air these pages hold them in.
  h1: {
    marginBlock: '0.75rem 0',
    scrollMarginTop: '1.5rem',
  },
  // The line under the h1. It says what the page is; nothing else does.
  deck: {
    marginBlock: '0.75rem 0',
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
  // The site's one inline treatment, from app.css. A syntax token here made
  // a flag name in a sentence orange on reference pages and neutral on
  // every other page.
  code: {},
  // A signature, or the usage line. It wraps between its bracket groups,
  // because the synopsis is the first thing a reader looks at and half of
  // it behind a horizontal scroll is half a synopsis.
  signature: {
    color: 'var(--th-token)',
    fontSize: 'var(--text-code)',
    lineHeight: 1.6,
    marginBlock: '1rem',
    // A long option keeps its own shape; the line breaks at the spaces
    // between groups, never inside `[<TARGET>...]`.
    overflowWrap: 'normal',
    paddingBlock: '0.75rem',
    paddingInline: '1rem',
    whiteSpace: 'pre-wrap',
    wordBreak: 'normal',
  },
})

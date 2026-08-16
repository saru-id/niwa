/* What a generated page carries that no other page does.
 *
 * Its title, deck, sections, prose and lists are set in
 * `src/styles/type.stylex.ts`, which the written pages read too, and its
 * tables live in `components/DataTable.tsx`. What is here is the two things
 * only these pages have: the name at the head of an index row, and the
 * signature. One module, because twenty-nine pages wear the same clothes.
 * The leading underscore keeps Astro from routing this file.
 */

import * as stylex from '@stylexjs/stylex'

export const styles = stylex.create({
  // The name in an index row, set in mono so the column of verbs aligns.
  name: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-inline-code)',
  },
  // A signature, or the usage line, inside the box every exhibit stands in.
  // It wraps between its bracket groups, because the synopsis is the first
  // thing a reader looks at and half of it behind a horizontal scroll is
  // half a synopsis.
  signature: {
    color: 'var(--th-token)',
    fontSize: 'var(--text-code)',
    lineHeight: 1.6,
    // A long option keeps its own shape; the line breaks at the spaces
    // between groups, never inside `[<TARGET>...]`.
    overflowWrap: 'normal',
    whiteSpace: 'pre-wrap',
    wordBreak: 'normal',
  },
})

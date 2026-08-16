import * as stylex from '@stylexjs/stylex'

/* What a written page carries that no other page does.
 *
 * Its title, deck, sections and prose are set in `src/styles/type.stylex.ts`,
 * which the generated pages read too. What is here is the line at the foot,
 * which only a page with a markdown twin has.
 */
export const styles = stylex.create({
  foot: {
    marginBlockStart: '2.5rem',
  },
  // A URL already is the feature, so the link says what it is and stops.
  // It stands alone in its paragraph rather than inside a sentence, so the
  // 24 pixel target minimum applies to it with no inline exception. Block
  // padding on an inline box costs the line no height.
  twin: {
    color: 'var(--ink-muted)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-meta)',
    paddingBlock: '6px',
    textDecorationColor: 'var(--border-strong)',
  },
})

import * as stylex from '@stylexjs/stylex'

/* A written page's furniture.
 *
 * The title and the deck are set in `src/styles/type.stylex.ts`, which the
 * generated pages read too. What is here is the ink and the air this page
 * adds to them.
 */
export const styles = stylex.create({
  title: {
    color: 'var(--ink-strong)',
    marginBlock: '0.6rem 0',
  },
  // A written page opens onto prose, so the deck is given a clear step of
  // air before the first paragraph.
  deck: {
    marginBlock: '0.75rem 2rem',
  },
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

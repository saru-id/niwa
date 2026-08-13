/* The landing — a typographic statement.
 *
 * One centred column, one left edge inside it, one hairline motif. The pitch
 * line is set at display size in the system sans; everything under it stays
 * at the scale the documentation uses, so the statement is the only thing
 * that raises its voice. Nothing here animates: the page's argument is that
 * the tool is calm.
 */

import * as stylex from '@stylexjs/stylex'

/* The landing's own column, wider than the documentation's 44rem for one
 * measured reason: the config excerpt's longest line is sixty-nine
 * characters, which needs 726px of frame to sit without a scrollbar. It hangs
 * on the left edge the header's wordmark and the footer's line already use. */
const COLUMN = '48rem'

/* The landing holds one width. Every paragraph, heading, rule, list and
 * code block ends at the same place as the config excerpt below them,
 * because a right edge that moves between blocks reads as an accident
 * rather than as a decision. The reading measure governs the long-form
 * documentation pages; a landing is short, and coherence wins here. */
const WORDS = COLUMN

/* The display line, from 38px at 375px to 72px at 1280px and no larger. The
 * floor keeps `configured` inside a 375px viewport with room to spare; the
 * ceiling keeps the statement to three lines in a 48rem column. */
const DISPLAY = 'clamp(2.375rem, 1.5rem + 3.75vw, 4.5rem)'

export const styles = stylex.create({
  // Flow root, so every band's air is the band's padding and never a margin
  // that escaped through the top of a child.
  column: {
    display: 'flow-root',
    // Centred as a band; the essay's one left edge lives inside it. Anchored
    // to the viewport's own edge, the column read as cramped, not composed.
    marginInline: 'auto',
    maxWidth: COLUMN,
  },

  /* ---- Band 2: statement ---- */

  bandStatement: {
    paddingBlock: 'clamp(3rem, 7vw, 5.5rem) clamp(2.5rem, 5vw, 4rem)',
  },
  // Larger than the documentation's h1, and the only element on the page that
  // is. The whole identity claim is the system sans set with care at this size.
  statement: {
    color: 'var(--ink-strong)',
    fontSize: DISPLAY,
    maxWidth: WORDS,
    fontWeight: 700,
    // A display line breaks between words. Never inside one: the body's
    // `overflow-wrap: break-word` is right for a path in running prose and
    // wrong for the sentence that carries the page.
    hyphens: 'none',
    // Tracking and leading close as the size grows, and they close smoothly
    // rather than in steps: the `em` term is the ratio the face wants at
    // display size, the `rem` term is what a smaller setting needs added back.
    // At 38px this is -0.030em over 1.12; at 53px, -0.036em over 1.08; at
    // 72px, -0.040em over 1.05.
    letterSpacing: 'calc(-0.0512em + 0.05rem)',
    lineHeight: 'calc(0.97em + 0.36rem)',
    marginBlock: 'clamp(1.25rem, 2.5vw, 1.75rem) 0',
    overflowWrap: 'normal',
    textWrap: 'balance',
    wordBreak: 'normal',
  },
  // The page's one ornament above the fold, and the same gesture the h2 rule
  // makes below it.
  rule: {
    backgroundColor: 'var(--border)',
    borderStyle: 'none',
    height: '1px',
    // A capped `hr` centres itself; this one belongs to the left edge every
    // other line on the page hangs from.
    marginInline: 0,
    maxWidth: WORDS,
    marginBlock: 'clamp(2rem, 4vw, 2.75rem)',
  },
  // Body scale, not a deck size. The statement above already carries the
  // emphasis, and a second raised voice would argue with it.
  lede: {
    color: 'var(--ink)',
    fontSize: 'var(--text-body)',
    lineHeight: 1.7,
    marginBlock: 0,
    maxWidth: WORDS,
    textWrap: 'pretty',
  },
  // Wide enough for the command and the controls that sit at its top right,
  // and no wider: the install line is a small precise object, and the
  // evidence below is what runs the full column.
  install: {
    maxWidth: WORDS,
  },
  secondary: {
    maxWidth: WORDS,
    fontSize: 'var(--text-body)',
    marginBlock: '1.5rem 0',
  },

  /* ---- Bands 3, 4 and 5 ---- */

  // Bands 3 and 4 are one pair, so nothing separates them but the 1.5rem the
  // blocks already carry. Bands 5 and 6 are spaced by their headings instead.
  band: {
    paddingBlock: 0,
  },
  figure: {
    display: 'flow-root',
    marginBlock: 0,
    marginInline: 0,
  },
  // The markdown block sets 1.5rem beneath itself. The negative margin brings
  // the caption to the 0.5rem the screen's own caption sits at.
  caption: {
    color: 'var(--ink-muted)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-meta)',
    marginBlockStart: '-1rem',
  },

  /* ---- Bands 5 and 6: the daily loop, then the boundary ---- */

  bandLast: {
    paddingBlock: '0 clamp(4rem, 8vw, 6rem)',
  },
  // The chapter rule: a hairline the width of the column, with air on both
  // sides of it. It is the strongest gesture the site owns and it costs one
  // border.
  heading: {
    maxWidth: WORDS,
    borderBlockStartColor: 'var(--border)',
    borderBlockStartStyle: 'solid',
    borderBlockStartWidth: '1px',
    color: 'var(--ink-strong)',
    fontSize: 'var(--text-h2)',
    fontWeight: 600,
    letterSpacing: '-0.02em',
    lineHeight: 1.2,
    marginBlock: 'clamp(2.5rem, 5vw, 3.5rem) 2rem',
    paddingBlockStart: '2.25rem',
    textWrap: 'balance',
  },
  steps: {
    maxWidth: WORDS,
    listStyle: 'none',
    marginBlock: 0,
    paddingInline: 0,
  },
  // Grid, and baseline alignment, so the numeral sits on the first line's
  // baseline rather than near it.
  step: {
    alignItems: 'baseline',
    columnGap: { default: '1rem', '@media (min-width: 768px)': '1.5rem' },
    display: 'grid',
    gridTemplateColumns: {
      default: '1.25rem minmax(0, 1fr)',
      '@media (min-width: 768px)': '2rem minmax(0, 1fr)',
    },
    marginBlock: { default: '0 2.25rem', ':last-child': 0 },
  },
  // Mono, muted, tabular: the numeral is chrome around the sentence, in the
  // face the rest of this site's chrome uses.
  numeral: {
    color: 'var(--ink-muted)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-h2)',
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 500,
    letterSpacing: '-0.01em',
  },
  stepText: {
    color: 'var(--ink)',
    lineHeight: 1.65,
    marginBlock: 0,
    maxWidth: WORDS,
  },
  boundaryText: {
    color: 'var(--ink)',
    lineHeight: 1.7,
    marginBlock: '0 1rem',
    maxWidth: WORDS,
  },
  onward: {
    maxWidth: WORDS,
    marginBlock: '0.6rem 0',
  },
  boundaryOnward: {
    maxWidth: WORDS,
    marginBlock: '1.75rem 0',
  },
  // Inline code takes the site's one treatment, from app.css.
  code: {},
})

import * as stylex from '@stylexjs/stylex'

export const styles = stylex.create({
  title: {
    color: 'var(--ink-strong)',
    fontSize: 'var(--text-h1)',
    fontWeight: 600,
    letterSpacing: '-0.015em',
    lineHeight: 1.15,
    marginBlock: '0.6rem 0',
    // A title is short enough to balance, and a one-word second line reads
    // as a mistake.
    textWrap: 'balance',
  },
  // The deck says what the page does, in the page's own words. It stays at
  // body size: the title is the size signal, and muted ink is the rest.
  deck: {
    color: 'var(--ink-muted)',
    marginBlock: '0.75rem 2rem',
    textWrap: 'pretty',
  },
  // The deck's bottom margin is the air before the article, so the
  // provenance line takes that air back and sits with the deck.
  provenance: {
    marginBlock: '-1.25rem 2rem',
  },
  sourceLink: {
    alignItems: 'center',
    color: 'var(--ink-muted)',
    display: 'inline-flex',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-meta)',
    gap: '0.375rem',
    // Block padding on an inline box costs the line no height, and it takes
    // the target past the 24 pixel minimum.
    paddingBlock: '6px',
    textDecorationColor: 'var(--border-strong)',
  },
  sourceIcon: {
    blockSize: '0.8125rem',
    display: 'inline-flex',
    inlineSize: '0.8125rem',
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

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

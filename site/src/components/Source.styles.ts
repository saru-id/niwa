import * as stylex from '@stylexjs/stylex'

export const styles = stylex.create({
  head: {
    marginBlockEnd: '1.75rem',
  },
  // The site's kicker: a small mono line above a title, saying what kind of
  // page this is.
  kicker: {
    alignItems: 'center',
    color: 'var(--ink-muted)',
    display: 'flex',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-kicker)',
    gap: '0.375rem',
    letterSpacing: '0.09em',
    margin: 0,
    textTransform: 'uppercase',
  },
  icon: {
    blockSize: '0.875rem',
    display: 'inline-flex',
    inlineSize: '0.875rem',
  },
  title: {
    color: 'var(--ink-strong)',
    fontSize: 'var(--text-h1)',
    fontWeight: 600,
    letterSpacing: '-0.015em',
    lineHeight: 1.15,
    marginBlock: '0.6rem 0',
    textWrap: 'balance',
  },
  back: {
    color: 'var(--ink-muted)',
    fontSize: 'var(--text-meta)',
    marginBlock: '0.75rem 0',
  },
  /* The component draws in a shadow root, so no rule here reaches inside
   * it. What crosses the boundary is the frame around it, which is the same
   * hairline and the same corner every other exhibit on the site wears. */
  frame: {
    borderColor: 'var(--border)',
    borderRadius: '8px',
    borderStyle: 'solid',
    borderWidth: 1,
    marginBlockEnd: '3rem',
    overflow: 'hidden',
  },
})

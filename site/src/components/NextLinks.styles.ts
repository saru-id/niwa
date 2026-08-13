import * as stylex from '@stylexjs/stylex'

export const styles = stylex.create({
  block: {
    borderBlockStartColor: 'var(--border)',
    borderBlockStartStyle: 'solid',
    borderBlockStartWidth: '1px',
    marginBlockStart: '3rem',
    paddingBlockStart: '1.5rem',
  },
  label: {
    color: 'var(--ink-muted)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-meta)',
    fontWeight: 500,
    marginBlock: '0 0.75rem',
  },
  list: {
    listStyle: 'none',
    marginBlock: 0,
    maxWidth: 'var(--measure)',
    paddingInline: 0,
  },
  item: {
    marginBlock: '0.4rem',
  },
  // The clause says why to follow the link, so it sits one step back from it.
  why: {
    color: 'var(--ink-muted)',
  },
})

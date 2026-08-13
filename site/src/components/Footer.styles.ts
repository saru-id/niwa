import * as stylex from '@stylexjs/stylex'

export const styles = stylex.create({
  footer: {
    borderBlockStartColor: 'var(--border)',
    borderBlockStartStyle: 'solid',
    borderBlockStartWidth: '1px',
  },
  // One line, and the only place the site names its version.
  line: {
    color: 'var(--ink-muted)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-meta)',
    paddingBlock: '1.25rem',
  },
  link: {
    color: { default: 'var(--ink-muted)', ':hover': 'var(--ink-strong)' },
    textDecoration: 'none',
    transitionDuration: '120ms',
    transitionProperty: 'color',
    transitionTimingFunction: 'ease',
  },
})

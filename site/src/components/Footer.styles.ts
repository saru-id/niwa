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
  // Twelve pixel type in one line draws a box 14 pixels tall. The block
  // padding takes it past the 24 pixel target minimum, and on an inline box
  // it costs the line no height, so the footer stays one line where it was.
  link: {
    color: { default: 'var(--ink-muted)', ':hover': 'var(--ink-strong)' },
    paddingBlock: '6px',
    textDecoration: 'none',
    transitionDuration: '120ms',
    transitionProperty: 'color',
    transitionTimingFunction: 'ease',
  },
})

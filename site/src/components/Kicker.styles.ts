import * as stylex from '@stylexjs/stylex'

export const styles = stylex.create({
  kicker: {
    color: 'var(--ink-muted)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-kicker)',
    fontWeight: 500,
    letterSpacing: '0.1em',
    marginBlock: 0,
    textTransform: 'uppercase',
  },
  // The dot carries the accent and no meaning, so it is hidden from the
  // accessibility tree and sized in em to follow the label.
  dot: {
    backgroundColor: 'var(--accent)',
    borderRadius: '50%',
    display: 'inline-block',
    height: '0.45em',
    marginInlineEnd: '0.55em',
    verticalAlign: '6%',
    width: '0.45em',
  },
})

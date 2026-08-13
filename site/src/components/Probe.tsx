import * as stylex from '@stylexjs/stylex'

// The probe proves the StyleX compiler runs in this build and that its rules
// reach the page. It reads the theme tokens as plain custom properties, which
// is the arrangement every styled component on the site uses.
const styles = stylex.create({
  kicker: {
    color: 'var(--ink-muted)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-kicker)',
    fontWeight: 500,
    letterSpacing: '0.1em',
    margin: 0,
    textTransform: 'uppercase',
  },
})

export function Probe({ label }: { label: string }) {
  return <p {...stylex.props(styles.kicker)}>{label}</p>
}

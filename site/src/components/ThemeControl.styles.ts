import * as stylex from '@stylexjs/stylex'

export const styles = stylex.create({
  group: {
    backgroundColor: 'var(--surface)',
    borderColor: 'var(--border-strong)',
    borderRadius: '5px',
    borderStyle: 'solid',
    borderWidth: '1px',
    display: 'flex',
    padding: '1px',
  },
  // The pressed state is styled off `aria-pressed`, which is also the state
  // a screen reader reads. There is no second class to keep in step.
  choice: {
    backgroundColor: {
      default: 'transparent',
      ':is([aria-pressed="true"])': 'var(--ground)',
    },
    borderStyle: 'none',
    borderRadius: '4px',
    color: {
      default: 'var(--ink-muted)',
      ':is([aria-pressed="true"])': 'var(--ink-strong)',
      ':hover': 'var(--ink-strong)',
    },
    cursor: 'pointer',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-kicker)',
    fontWeight: 500,
    letterSpacing: '0.06em',
    paddingBlock: '0.3rem',
    paddingInline: '0.5rem',
    textTransform: 'uppercase',
    transitionDuration: '120ms',
    transitionProperty: 'color, background-color',
    transitionTimingFunction: 'ease',
  },
})

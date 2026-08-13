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
    // The pressed pill is `--ground` on a `--surface` group, which is 1.04:1
    // in light and 1.05:1 in dark: no edge a reader can see. The rule is the
    // accent, which measures 5.63:1 and 7.27:1 against the pill it sits on,
    // and it is the mark the rail and the table of contents already use for
    // the entry you are standing in. Inset, so pressing shifts nothing.
    boxShadow: {
      default: null,
      ':is([aria-pressed="true"])': 'inset 0 -2px 0 0 var(--accent)',
    },
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
    // Three buttons that touch, so the spacing exception does not apply and
    // each one has to reach 24 pixels on its own.
    paddingBlock: '0.4rem',
    paddingInline: '0.5rem',
    textTransform: 'uppercase',
    transitionDuration: '120ms',
    transitionProperty: 'color, background-color',
    transitionTimingFunction: 'ease',
  },
})

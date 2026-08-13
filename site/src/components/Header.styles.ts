import * as stylex from '@stylexjs/stylex'

export const styles = stylex.create({
  header: {
    borderBlockEndColor: 'var(--border)',
    borderBlockEndStyle: 'solid',
    borderBlockEndWidth: '1px',
  },
  // The controls need more room than a phone has beside the wordmark, so
  // the bar wraps rather than scrolling sideways.
  bar: {
    alignItems: 'center',
    columnGap: '1.5rem',
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingBlock: '0.875rem',
    rowGap: '0.75rem',
  },
  // Lowercase, because that is what the command is called.
  wordmark: {
    color: 'var(--ink-strong)',
    fontFamily: 'var(--font-mono)',
    fontSize: '1rem',
    fontWeight: 600,
    letterSpacing: '-0.01em',
    textDecoration: 'none',
  },
  controls: {
    alignItems: 'center',
    columnGap: '0.75rem',
    display: 'flex',
    flexWrap: 'wrap',
    rowGap: '0.5rem',
  },
  // A control's own boundary, so it is drawn in the stronger of the two
  // border tokens. `--border` is the hairline between blocks, and at 1.26:1
  // it is not an edge a reader can find.
  search: {
    alignItems: 'center',
    backgroundColor: 'var(--surface)',
    borderColor: 'var(--border-strong)',
    borderRadius: '5px',
    borderStyle: 'solid',
    borderWidth: '1px',
    color: { default: 'var(--ink-muted)', ':hover': 'var(--ink-strong)' },
    columnGap: '0.5rem',
    cursor: 'pointer',
    display: 'flex',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-meta)',
    paddingBlock: '0.3rem',
    paddingInline: '0.6rem',
    transitionDuration: '120ms',
    transitionProperty: 'color, border-color',
    transitionTimingFunction: 'ease',
  },
  // A touch device has no command key, so the hint is not shown there.
  kbd: {
    color: 'var(--ink-muted)',
    display: { default: 'none', '@media (min-width: 640px)': 'inline' },
    fontSize: 'inherit',
  },
  link: {
    color: { default: 'var(--ink-muted)', ':hover': 'var(--ink-strong)' },
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-meta)',
    // Twelve pixel type draws a box under the 24 pixel target minimum. The
    // padding grows the box and the equal negative margin keeps the margin
    // box the size the bar measured, so the bar's height does not move.
    marginBlock: '-0.25rem',
    paddingBlock: '0.25rem',
    textDecoration: 'none',
    transitionDuration: '120ms',
    transitionProperty: 'color',
    transitionTimingFunction: 'ease',
  },
  // The whole sidebar folds into the header below the layout's first
  // breakpoint, where there is no column to put it in.
  disclosure: {
    borderBlockStartColor: 'var(--border)',
    borderBlockStartStyle: 'solid',
    borderBlockStartWidth: '1px',
    display: { default: 'block', '@media (min-width: 1024px)': 'none' },
  },
  // A page with no rail has no other navigation, so the disclosure is the
  // navigation at every width. The condition is repeated rather than
  // dropped: StyleX keys a conditional value by its at-rule, so only the
  // same at-rule overrides the one above.
  disclosureAtEveryWidth: {
    display: { default: 'block', '@media (min-width: 1024px)': 'block' },
  },
  disclosureLabel: {
    color: { default: 'var(--ink-muted)', ':hover': 'var(--ink-strong)' },
    cursor: 'pointer',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-kicker)',
    fontWeight: 500,
    letterSpacing: '0.1em',
    paddingBlock: '0.75rem',
    paddingInline: '1.25rem',
    textTransform: 'uppercase',
    transitionDuration: '120ms',
    transitionProperty: 'color',
    transitionTimingFunction: 'ease',
  },
})

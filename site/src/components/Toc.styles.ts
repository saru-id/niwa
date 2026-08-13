import * as stylex from '@stylexjs/stylex'

export const styles = stylex.create({
  // The rail is the last thing to appear and the first thing to go. Its
  // content is not repeated anywhere, so nothing is lost when it goes.
  rail: {
    alignSelf: 'start',
    display: { default: 'none', '@media (min-width: 1280px)': 'block' },
    fontSize: 'var(--text-toc)',
    insetBlockStart: 'var(--header-height)',
    lineHeight: 1.5,
    maxHeight: 'calc(100dvh - var(--header-height))',
    overflowY: 'auto',
    paddingBlock: '2.5rem',
    position: 'sticky',
  },
  label: {
    color: 'var(--ink-muted)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-meta)',
    fontWeight: 500,
    marginBlock: '0 0.625rem',
  },
  list: {
    borderInlineStartColor: 'var(--border)',
    borderInlineStartStyle: 'solid',
    borderInlineStartWidth: '1px',
    listStyle: 'none',
    marginBlock: 0,
    paddingInline: 0,
  },
  // The active segment sits on the rail itself: its own hairline replaces
  // the list's, so nothing moves when the reader scrolls.
  item: {
    borderInlineStartColor: {
      default: 'transparent',
      ':is([aria-current="true"])': 'var(--accent)',
    },
    borderInlineStartStyle: 'solid',
    borderInlineStartWidth: '1px',
    color: {
      default: 'var(--ink-muted)',
      ':is([aria-current="true"])': 'var(--ink-strong)',
      ':hover': 'var(--ink-strong)',
    },
    display: 'block',
    marginInlineStart: '-1px',
    paddingBlock: '0.25rem',
    paddingInline: '0.75rem',
    textDecoration: 'none',
    transitionDuration: '120ms',
    transitionProperty: 'color, border-color',
    transitionTimingFunction: 'ease',
  },
  nested: {
    paddingInlineStart: '1.5rem',
  },
})

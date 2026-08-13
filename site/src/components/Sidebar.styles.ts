import * as stylex from '@stylexjs/stylex'

export const styles = stylex.create({
  nav: {
    fontSize: 'var(--text-nav)',
    lineHeight: 1.5,
  },
  // The rail keeps its own scroll so a long group never drags the page.
  rail: {
    alignSelf: 'start',
    display: { default: 'none', '@media (min-width: 1024px)': 'block' },
    insetBlockStart: 'var(--header-height)',
    maxHeight: 'calc(100dvh - var(--header-height))',
    overflowY: 'auto',
    paddingBlock: '2.5rem',
    position: 'sticky',
  },
  // Open, the panel is about 1400 pixels of links, which buried the page
  // under two viewport heights and put the summary that closes it out of
  // reach. It scrolls in its own box instead, the way the rail does.
  // 10.5rem is everything above it at its tallest: the bar wraps to three
  // rows at 320 and with the summary measures 167 pixels there, against 139
  // at 375. The taller of the two is the one that has to fit.
  panel: {
    display: { default: 'block', '@media (min-width: 1024px)': 'none' },
    maxHeight: 'calc(100dvh - var(--header-height) - 3rem)',
    overflowY: 'auto',
    paddingBlock: '0 1.25rem',
    paddingInline: '1.25rem',
  },
  // Shown at every width, for a page with no rail to hand navigation to.
  panelAtEveryWidth: {
    display: { default: 'block', '@media (min-width: 1024px)': 'block' },
  },
  group: {
    marginBlockStart: '1.25rem',
  },
  label: {
    color: { default: 'var(--ink-muted)', ':hover': 'var(--ink-strong)' },
    cursor: 'pointer',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-nav)',
    fontWeight: 500,
    paddingBlock: '0.25rem',
    transitionDuration: '120ms',
    transitionProperty: 'color',
    transitionTimingFunction: 'ease',
  },
  list: {
    listStyle: 'none',
    marginBlock: '0.375rem 0',
    paddingInline: 0,
  },
  // The current page is styled off `aria-current`, which is also what a
  // screen reader announces. The inset ring costs no layout shift.
  item: {
    backgroundColor: {
      default: 'transparent',
      ':is([aria-current="page"])': 'var(--surface)',
      ':hover': 'var(--surface)',
    },
    borderRadius: '5px',
    boxShadow: {
      default: null,
      ':is([aria-current="page"])': 'inset 0 0 0 1px var(--border)',
    },
    color: {
      default: 'var(--ink-muted)',
      ':is([aria-current="page"])': 'var(--ink-strong)',
      ':hover': 'var(--ink-strong)',
    },
    display: 'block',
    paddingBlock: '0.2rem',
    paddingInline: '0.5rem',
    textDecoration: 'none',
    transitionDuration: '120ms',
    transitionProperty: 'color, background-color',
    transitionTimingFunction: 'ease',
  },
})

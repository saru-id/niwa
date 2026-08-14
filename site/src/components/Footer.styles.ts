import * as stylex from '@stylexjs/stylex'

export const styles = stylex.create({
  footer: {
    borderBlockStartColor: 'var(--border)',
    borderBlockStartStyle: 'solid',
    borderBlockStartWidth: '1px',
  },
  /* The version sits at one end and the three links at the other, so the
   * foot of the page has the same two edges every band above it has. It is
   * given room: a hairline with a line of type pressed against it reads as
   * the page having run out rather than having ended. */
  line: {
    justifyContent: 'space-between',
    paddingBlock: 'var(--spacing-8)',
  },
  links: {
    columnGap: 'var(--spacing-5)',
  },
  // The face the rest of the site's chrome is set in. The design system
  // carries the size and the ink; the site carries the face.
  version: {
    fontFamily: 'var(--font-mono)',
  },
  // A footer link is chrome, and chrome is not underlined running prose. The
  // site's own rule for a bare anchor is unlayered, so it is answered here
  // rather than reverted.
  //
  // Twelve pixel type in one line draws a box 14 pixels tall. The block
  // padding takes it past the 24 pixel target minimum, and on an inline box
  // it costs the line no height, so the footer stays one line where it was.
  link: {
    color: { default: 'var(--ink-muted)', ':hover': 'var(--ink-strong)' },
    fontFamily: 'var(--font-mono)',
    paddingBlock: '6px',
    textDecorationLine: 'none',
    transitionDuration: 'var(--duration-fast)',
    transitionProperty: 'color',
    transitionTimingFunction: 'ease',
  },
})

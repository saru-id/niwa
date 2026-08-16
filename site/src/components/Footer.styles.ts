import * as stylex from '@stylexjs/stylex'
import { FRAME } from '../styles/layout.stylex'

export const styles = stylex.create({
  footer: {
    borderBlockStartColor: 'var(--border)',
    borderBlockStartStyle: 'solid',
    borderBlockStartWidth: '1px',
  },
  /* The footer sits below the chrome's grid, so it caps and centres itself on
   * the page's outer measure. The landing's bands end at the same width, and a
   * wide window reads as one column from the first band to the last line. */
  column: {
    marginInline: 'auto',
    maxWidth: FRAME.shell,
    paddingInline: FRAME.gutter,
    width: '100%',
  },
  /* The version sits at one end and the three links at the other, so the
   * foot of the page has the same two edges every band above it has. It is
   * given room: a hairline with a line of type pressed against it reads as
   * the page having run out rather than having ended. */
  line: {
    alignItems: 'center',
    columnGap: '1rem',
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingBlock: '2rem',
    rowGap: '1rem',
  },
  links: {
    alignItems: 'center',
    columnGap: '1.25rem',
    display: 'flex',
    flexWrap: 'wrap',
  },
  // The face the rest of the site's chrome is set in, at the same size and
  // leading as the links, so the line carries one size of type.
  version: {
    color: 'var(--ink-muted)',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.8125rem',
    lineHeight: 1.5385,
  },
  // A footer link is chrome, and chrome is not underlined running prose. The
  // site's own rule for a bare anchor is unlayered, so it is answered here
  // rather than reverted. The rule's colour and its transition are kept: a
  // link in the foot of the page is still one of the site's links.
  //
  // Thirteen pixel type at this leading draws a box 20 pixels tall; the
  // ratio is that box over the type. The block padding takes each link past
  // the 24 pixel target minimum — it counts toward the box because a flex
  // item is blockified — and the links are the tallest thing on the line,
  // so they set its height.
  link: {
    fontSize: '0.8125rem',
    lineHeight: 1.5385,
    paddingBlock: '6px',
    textDecorationLine: 'none',
  },
})

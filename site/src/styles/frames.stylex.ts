import * as stylex from '@stylexjs/stylex'

/* The box an exhibit stands in.
 *
 * An exhibit is a screen the tool printed, a listing of files, a fence of
 * code, or a signature. They are the four things the site sets apart from
 * the prose around them, and the same box sets each apart: the surface, one
 * hairline, the site's one corner, the same air inside and outside it, and a
 * sideways scroll for any line an exhibit does not wrap.
 *
 * Face, size and leading are not here. A listing, a fence and a screen are
 * three different kinds of text and each sets its own. The air is not theirs
 * to set: four boxes down one column, padded four ways, read as four
 * decisions rather than one site.
 *
 * The name of this file is part of the contract. The StyleX compiler follows
 * a cross-module import only when the specifier ends in `.stylex`. Under any
 * other name, every exhibit that reads from here loses its box.
 */

/* The measurements the box is built from, for anything that has to line up
 * with them from outside it. */
export const BOX = stylex.defineConsts({
  /* The corner an exhibit is cut with. Twice the chrome's `--radius-inner`
   * in `app.css`, so the larger furniture reads as the larger furniture. */
  radius: '8px',
  padBlock: '1rem',
  padInline: '1.25rem',
})

export const EXHIBIT = stylex.create({
  // The air an exhibit keeps from the prose above and below it. A `figure`
  // and a `pre` both arrive carrying an inline margin, so it is stated away
  // here rather than at each of them.
  //
  // The block half is published rather than fixed. Prose is what it is for,
  // and a page that lays exhibits out itself — the landing's config proof
  // stands one directly under another with a drawn connector between them —
  // wants the grid to own that spacing and nothing else to add to it. The
  // default is the prose measure, so a consumer that says nothing is
  // unchanged; one that says otherwise does not have to outrank an atomic
  // class it cannot see.
  block: {
    marginBlock: 'var(--exhibit-block-margin, 1.5rem)',
    marginInline: 0,
  },
  frame: {
    backgroundColor: 'var(--surface)',
    borderColor: 'var(--border)',
    borderRadius: BOX.radius,
    borderStyle: 'solid',
    borderWidth: 1,
    overflowX: 'auto',
  },
  // The air inside the box. The inline half is wider than the block half
  // because a line of code runs to the end of it and a stack of lines does
  // not, so equal padding would read as a text that leans right.
  air: {
    paddingBlock: BOX.padBlock,
    paddingInline: BOX.padInline,
  },
})

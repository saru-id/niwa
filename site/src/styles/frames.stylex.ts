import * as stylex from '@stylexjs/stylex'

/* The box an exhibit stands in.
 *
 * An exhibit is a screen the tool printed, a listing of files, a fence of
 * code, or a signature. They are the four things the site sets apart from
 * the prose around them, and the same box sets each apart: the surface, one
 * hairline, the site's one corner, and a sideways scroll for any line an
 * exhibit does not wrap.
 *
 * Face, size, leading and padding are not here. Each exhibit sets its own,
 * because a listing, a fence and a screen are three different kinds of text
 * and the air they need is not the same.
 *
 * The name of this file is part of the contract. The StyleX compiler follows
 * a cross-module import only when the specifier ends in `.stylex`. Under any
 * other name, every exhibit that reads from here loses its box.
 */

export const EXHIBIT = stylex.create({
  // The figure an exhibit and its caption stand in.
  figure: {
    marginBlock: '1.5rem',
    marginInline: 0,
  },
  frame: {
    backgroundColor: 'var(--surface)',
    borderColor: 'var(--border)',
    borderRadius: 8,
    borderStyle: 'solid',
    borderWidth: 1,
    overflowX: 'auto',
  },
})

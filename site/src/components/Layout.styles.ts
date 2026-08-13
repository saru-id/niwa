import * as stylex from '@stylexjs/stylex'

/* The one measurement the shell does not own.
 *
 * The design system's shell carries the header, the navigation column and
 * the reading column. What it does not carry is the footer, which sits
 * below it, or the landing's full-width bands. Both line their content up
 * on the same maximum width: the three columns and the two gaps between
 * them, plus the padding either side.
 */
const MAX_WIDTH = 'calc(15rem + 3.5rem + 44rem + 3.5rem + 13rem + 2.5rem)'

export const styles = stylex.create({
  column: {
    marginInline: 'auto',
    maxWidth: MAX_WIDTH,
    paddingInline: '1.25rem',
    width: '100%',
  },
})

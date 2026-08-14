import * as stylex from '@stylexjs/stylex'

/* The one measurement the shell does not own.
 *
 * The design system's shell carries the header, the navigation column and
 * the reading frame. What it does not carry is the footer, which sits below
 * it, or the landing's full-width bands. Both line their content up on the
 * same maximum width: the navigation column's 260 and the 1040 the reading
 * frame is budgeted at, which `Shell.styles.ts` states and explains.
 */
const MAX_WIDTH = '81.25rem'

export const styles = stylex.create({
  column: {
    marginInline: 'auto',
    maxWidth: MAX_WIDTH,
    paddingInline: '1.25rem',
    width: '100%',
  },
})

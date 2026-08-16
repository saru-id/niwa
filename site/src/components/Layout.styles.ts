import * as stylex from '@stylexjs/stylex'
import { FRAME } from '../styles/layout.stylex'

/* The centred column the footer and the landing share.
 *
 * Both sit outside the chrome's grid: the footer below it, the landing's
 * bands across the whole window. They cap and centre their content on one
 * width, so a wide window reads as a single column from the first band to
 * the last line of the footer.
 */

export const styles = stylex.create({
  column: {
    marginInline: 'auto',
    maxWidth: FRAME.shell,
    paddingInline: FRAME.gutter,
    width: '100%',
  },
})

import * as stylex from '@stylexjs/stylex'
import { FRAME } from '../styles/layout.stylex'

/* The centred column the landing's bands cap and centre on.
 *
 * The bands run across the whole window and sit outside the chrome's grid,
 * so the cap is theirs to state. The footer states the same column with its
 * own styles, and both read the width from one module.
 */

export const styles = stylex.create({
  column: {
    marginInline: 'auto',
    maxWidth: FRAME.shell,
    paddingInline: FRAME.gutter,
    width: '100%',
  },
})

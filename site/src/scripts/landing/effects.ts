/* The scene's effects, in the order they draw.
 *
 * The entry names its effects here and nowhere else, so the module list and
 * the draw order are one statement. One line stands for one effect, in the
 * order it is drawn: ripples, basin, lantern, fireflies, flowers.
 */

export { createRipples } from './ripples'
export { createBasin } from './basin'
export { createLantern } from './lantern'
export { createFireflies } from './fireflies'
export { createFlowers } from './flowers'

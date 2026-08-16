import * as stylex from '@stylexjs/stylex'

/* The widths the layout turns on, and the measurements the frame is built from.
 *
 * Nothing else belongs here. Colour, type and spacing live elsewhere; this
 * module is breakpoints and frame only.
 *
 * The site styles itself from three homes: StyleX modules, `chrome.css` and
 * `app.css`. A width that decides whether a column exists has to be the same
 * width in all three. This module states each one once, and an importer reads
 * it from here.
 *
 * Plain CSS cannot read a module's values, so it keeps its custom properties
 * and its own literals. Every value it mirrors carries a comment naming this
 * module as the source. A change starts here and is copied outward.
 *
 * The name of this file is part of the contract. The StyleX compiler follows
 * a cross-module import only when the specifier ends in `.stylex`. Under any
 * other name, every `stylex.create` that reads from here breaks.
 */

/* Whole media conditions, never fragments. StyleX takes the condition string
 * as the key of a style value, so half a query is worth nothing to it.
 */
export const MEDIA = stylex.defineConsts({
  /* Below the rail's width the page is one column, and the rail becomes the
   * drawer the bar opens. */
  rail: '@media (max-width: 900px)',
  /* The same edge from above. The rail is drawn here, so what stands in for
   * the drawer is not. */
  railUp: '@media (min-width: 901px)',
  /* Where the bar's tools would start to crowd the wordmark. They drop their
   * words and keep their marks. */
  tools: '@media (max-width: 1080px)',
  /* Where the contents column appears. The article pays for it at first:
   * from 1280 the article runs 48px under its cap, and it regains the full
   * measure at 1328. Below 1280 the contents would cost the article more
   * than they say. */
  toc: '@media (min-width: 1280px)',
  /* One pixel past the width where search stops being a dialog and becomes a
   * full screen sheet with no corners and no entrance. */
  dialog: '@media (min-width: 641px)',
})

export const FRAME = stylex.defineConsts({
  /* The rail's width. The bar's identity sits over the same column, so the
   * bar and the columns below it read as one grid. */
  rail: '17rem',
  /* The bar's height. The rail, the contents column and the drawer's own
   * head all hold this line. */
  bar: '3.25rem',
  /* The air the bar and the rail both hold their contents in. */
  gutter: '1.25rem',
  /* The reading column's cap. */
  article: '46rem',
  /* The contents column, beside the article. */
  toc: '15rem',
  /* The page's outer measure: 1300px, the ceiling the footer line and the
   * landing's bands end at. A window keeps growing and the page does not
   * follow it. The chrome's own columns sum narrower, so this cap binds only
   * the widest bands. */
  shell: '81.25rem',
})

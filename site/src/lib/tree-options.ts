/* The tree options that both sides of hydration must agree on.
 *
 * The library merges nothing. If the server and the browser disagree on an
 * option that shapes the first render, the tree breaks instead of redrawing,
 * so both callers read these from one place instead of each writing them out.
 *
 * This file is imported by the browser. It must never reach for Node.
 */

import type { FileTreePreparedInput } from '@pierre/trees'

export function treeOptions(preparedInput: FileTreePreparedInput) {
  return {
    preparedInput,
    /** Every directory open. A structure the docs show is shown whole. */
    initialExpansion: 'open',
    /** One glyph for a file, one for a folder. The larger sets carry fifty
     * language icons, none of which knows Luau, and they cost 37 KB of markup
     * per tree to draw the same default file in a different colour. */
    icons: 'minimal',
    /** Every row, so the tree is complete in the HTML before any script runs.
     * The host is shorter than that and scrolls. */
    initialVisibleRowCount: preparedInput.paths.length,
  } as const
}

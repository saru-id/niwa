/* A directory structure, server rendered, for React contexts.
 *
 * `Tree.astro` wraps this for pages; the markdown pipeline renders it for
 * `tree` fences. The SSR payload is declarative shadow DOM: the parser
 * attaches the shadow root and the rows are on the page before any script
 * runs. Hydration arrives separately through `Tree.loader.ts`, which the
 * docs template loads; it does nothing on a page without a tree.
 */

import { FILE_TREE_DEFAULT_ITEM_HEIGHT } from '@pierre/trees'
import { preloadFileTree, serializeFileTreeSsrPayload } from '@pierre/trees/ssr'
import * as stylex from '@stylexjs/stylex'
import type { PreparedTree } from '../lib/tree'
import { treeOptions } from '../lib/tree-options'
import { styles } from './Tree.styles'

/** Twenty rows is 600 pixels, which still fits beside prose on the short
 * side of a laptop window. A taller tree loses its top while its bottom is
 * read, so past twenty rows the tree scrolls instead of growing. */
const MAX_ROWS = 20

export function TreeBlock({
  tree,
  label,
  id,
}: {
  tree: PreparedTree
  /** The root the tree hangs from, for example `~/.config/niwa`. */
  label: string
  /** Unique on the page; the browser reads it back off the element. */
  id?: string
}) {
  const treeId = id ?? `tree-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  const payload = preloadFileTree({ ...treeOptions(tree.preparedInput), id: treeId })
  const height = Math.min(tree.rowCount, MAX_ROWS) * FILE_TREE_DEFAULT_ITEM_HEIGHT

  return (
    <>
      {/* The library names its own tree role nothing; the caption is the
        figure's accessible name, read before the rows. */}
      <figure {...stylex.props(styles.figure)} data-tree>
        <figcaption {...stylex.props(styles.caption)}>{label}</figcaption>
        <div {...stylex.props(styles.frame)}>
          <div
            {...stylex.props(styles.host(height))}
            dangerouslySetInnerHTML={{ __html: serializeFileTreeSsrPayload(payload) }}
          />
        </div>
        <script
          type="application/json"
          data-tree-paths
          dangerouslySetInnerHTML={{ __html: JSON.stringify(tree.paths) }}
        />
      </figure>
      {tree.notes.length > 0 && (
        <div {...stylex.props(styles.notes)}>
          {tree.notes.map((note) => (
            <div key={note.path} {...stylex.props(styles.noteRow)}>
              <p {...stylex.props(styles.notePath)}>{note.path}</p>
              <p {...stylex.props(styles.noteText)}>{note.note}</p>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

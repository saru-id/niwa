/* A directory structure, with each entry's purpose beside it.
 *
 * This was `@pierre/trees`, rendered into a shadow root and hydrated. The
 * library draws a very good interactive file tree, and that is not what a
 * documentation page needs: these listings are shown fully expanded, they
 * are eight to twelve rows long, and nothing on the page ever collapses
 * one. What they do need is a note against each row, and the library has no
 * seam for one — a row is a grid of truncating path segments with no slot
 * for anything after them.
 *
 * So the purposes used to be printed underneath, as a second list that
 * repeated every path to attach its note. That listing was longer than the
 * tree it explained and it made the reader match the two by eye.
 *
 * Now it is one grid: the structure in the first column, the purpose in the
 * second, a row each. The prefixes are the box-drawing runs `lib/tree.ts`
 * works out, which is what `tree` prints, which is what a reader of this
 * tool already has in their terminal.
 */

import * as stylex from '@stylexjs/stylex'
import type { PreparedTree } from '../lib/tree'
import { styles } from './Tree.styles'

export function TreeBlock({
  tree,
  label,
  id,
}: {
  tree: PreparedTree
  /** The root the tree hangs from, for example `~/.config/niwa`. */
  label: string
  /** Unique on the page. */
  id?: string
}) {
  const treeId = id ?? `tree-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  const annotated = tree.rows.some((row) => row.note !== undefined)

  return (
    <figure {...stylex.props(styles.figure)} data-tree>
      <div {...stylex.props(styles.frame)}>
        {/* The root the rows hang from. It is the first line of the listing
          rather than a caption above it, because that is where `tree` puts
          it and because the rows are drawn as its children. */}
        <p {...stylex.props(styles.root)} id={treeId}>
          {label}
        </p>
        <div
          {...stylex.props(styles.rows, annotated && styles.rowsAnnotated)}
          role="group"
          aria-labelledby={treeId}
        >
          {tree.rows.map((row) => (
            <div key={row.path} {...stylex.props(styles.row)}>
              <span {...stylex.props(styles.name)}>
                {/* The prefix is decoration for the eye and noise for a
                  screen reader, which would read every bar and elbow. The
                  indentation it draws is already in the path. */}
                <span {...stylex.props(styles.prefix)} aria-hidden="true">
                  {row.prefix}
                </span>
                <span {...stylex.props(row.name.endsWith('/') && styles.directory)}>
                  {row.name}
                </span>
              </span>
              {annotated && (
                <span {...stylex.props(styles.note)}>{row.note ?? ''}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </figure>
  )
}

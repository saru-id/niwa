/* The trees on the page, made live.
 *
 * The rows are already there: the server rendered them and the parser
 * attached the shadow root. This file adds only what a script can add,
 * folders that open and arrow keys that move, so a reader without it loses
 * nothing but the ability to fold the tree up.
 */

import { FileTree, preparePresortedFileTreeInput } from '@pierre/trees'
import { treeOptions } from '../lib/tree-options'

for (const figure of document.querySelectorAll('[data-tree]')) {
  const container = figure.querySelector('file-tree-container')
  const source = figure.querySelector('[data-tree-paths]')
  if (!(container instanceof HTMLElement) || source === null) continue
  const paths: unknown = JSON.parse(source.textContent ?? 'null')
  if (!Array.isArray(paths)) continue

  const tree = new FileTree({
    ...treeOptions(preparePresortedFileTreeInput(paths as string[])),
    id: container.id,
  })
  tree.hydrate({ fileTreeContainer: container })
}

/* Directory structures, prepared at build time.
 *
 * The tree draws structure and nothing else. What an entry is for belongs in
 * the prose beside it, so a note travels with its path through here and the
 * component never receives one.
 *
 * `@pierre/trees` builds its own hierarchy from a flat list of paths. It can
 * sort that list itself, but only alphabetically, and the config repo has a
 * meaningful order that the alphabet is not. So the order is declared here,
 * the list is sorted here, and the library is handed the result presorted.
 */

import { existsSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type FileTreePreparedInput, preparePresortedFileTreeInput } from '@pierre/trees'

/** One entry in a tree. */
export type TreeEntry = {
  /** The path from the tree's root, separated by `/`. A trailing `/` marks a
   * directory, which is how a directory holding nothing still gets a row. */
  path: string
  /** What the entry is for, in one line. Read beside the tree, never in it. */
  note?: string
}

/** An entry's note, kept with the path it belongs to. */
export type TreeNote = {
  path: string
  note: string
}

/** A tree the component can render. */
export type PreparedTree = {
  /** The input the library renders. Built once, here, never in the page. */
  preparedInput: FileTreePreparedInput
  /** Every path, directories included, in the order the tree draws them. */
  paths: readonly string[]
  /** One row per path. The host's height is measured from this. */
  rowCount: number
  /** The notes that came in, in tree order. The component never sees them. */
  notes: readonly TreeNote[]
}

/** The top level of a config repo, in the order a person reads it: the file
 * that runs, the file it locks, then the directories it draws on. Taken from
 * the design site's own listing and checked against `tests/fixtures/example`,
 * which holds all eight of these names and no others. A name outside this
 * list sorts after every name in it. */
export const CONFIG_REPO_ORDER: readonly string[] = [
  'init.luau',
  '.luaurc',
  'niwa.lock',
  'modules',
  'hosts',
  'files',
  'secrets',
  'state',
]

type Node = {
  name: string
  path: string
  directory: boolean
  children: Map<string, Node>
}

/** Prepare entries for the component.
 *
 * `order` names the top level, first to last. Deeper levels follow the
 * library's own convention: directories before files, then by name.
 */
export function prepareTree(
  entries: readonly TreeEntry[],
  order: readonly string[] = CONFIG_REPO_ORDER,
): PreparedTree {
  const root: Node = { name: '', path: '', directory: true, children: new Map() }
  for (const entry of entries) {
    insert(root, entry.path)
  }

  const paths: string[] = []
  walk(root, order, paths)

  // A note reaches its row by path, so both sides drop the trailing slash a
  // directory carries and the leading `./` a filesystem walk can leave.
  const notes = new Map<string, string>()
  for (const entry of entries) {
    if (entry.note !== undefined) notes.set(key(entry.path), entry.note)
  }
  const ordered: TreeNote[] = []
  for (const path of paths) {
    const note = notes.get(key(path))
    if (note !== undefined) ordered.push({ path, note })
  }

  return {
    preparedInput: preparePresortedFileTreeInput(paths),
    paths,
    rowCount: paths.length,
    notes: ordered,
  }
}

/** Every path under a directory of the repository, as a tree shows them.
 *
 * `relative` runs from the repository root, for example
 * `tests/fixtures/example`. Directories come back with a trailing slash, so
 * the tree shows the structure that is on disk and not a summary of it.
 * `.git` is the only omission: it is a repository's machinery, not part of
 * the configuration the reader is being shown.
 */
export function readTree(relative: string): TreeEntry[] {
  const root = locate(relative)
  const entries: TreeEntry[] = []
  const descend = (directory: string, prefix: string): void => {
    for (const child of readdirSync(directory, { withFileTypes: true })) {
      if (child.name === '.git') continue
      const path = `${prefix}${child.name}`
      if (child.isDirectory()) {
        entries.push({ path: `${path}/` })
        descend(join(directory, child.name), `${path}/`)
      } else {
        entries.push({ path })
      }
    }
  }
  descend(root, '')
  return entries
}

/** Add one path and every directory above it to the forest. */
function insert(root: Node, path: string): void {
  const directory = path.endsWith('/')
  const segments = path.split('/').filter((segment) => segment !== '' && segment !== '.')
  let node = root
  for (const [index, name] of segments.entries()) {
    const last = index === segments.length - 1
    const child = node.children.get(name)
    if (child === undefined) {
      node.children.set(name, {
        name,
        path: node.path === '' ? name : `${node.path}/${name}`,
        directory: directory || !last,
        children: new Map(),
      })
    } else if (!last) {
      // A path proved this node has children, so it is a directory whatever
      // an earlier entry named it.
      child.directory = true
    }
    node = node.children.get(name) as Node
  }
}

/** Walk the forest depth first, writing each node's path in draw order. */
function walk(node: Node, order: readonly string[], out: string[]): void {
  const children = [...node.children.values()]
  const top = node.path === ''
  children.sort((left, right) => compare(left, right, top ? order : []))
  for (const child of children) {
    out.push(child.directory ? `${child.path}/` : child.path)
    walk(child, order, out)
  }
}

function compare(left: Node, right: Node, order: readonly string[]): number {
  const ranks = rank(left.name, order) - rank(right.name, order)
  if (ranks !== 0) return ranks
  if (left.directory !== right.directory) return left.directory ? -1 : 1
  return left.name.localeCompare(right.name, 'en', { numeric: true, sensitivity: 'base' })
}

function rank(name: string, order: readonly string[]): number {
  const index = order.indexOf(name)
  return index === -1 ? order.length : index
}

function key(path: string): string {
  return path.replace(/^\.\//, '').replace(/\/$/, '')
}

/** The directory `relative` names, found from this file or from the working
 * directory. The site builds from `site/` and a bundled build can place this
 * module anywhere beneath the repository, so neither anchor is trusted
 * alone. */
function locate(relative: string): string {
  const starts = [dirname(fileURLToPath(import.meta.url)), process.cwd()]
  for (const start of starts) {
    for (let directory = start; ; directory = dirname(directory)) {
      const candidate = join(directory, relative)
      if (existsSync(candidate)) return candidate
      if (dirname(directory) === directory) break
    }
  }
  throw new Error(
    `Reading the directory structure at ${relative}. No such directory sits ` +
      `above ${starts.join(' or ')}. The site reads structures from the ` +
      'repository, so it must build inside one. The site did not build.',
  )
}

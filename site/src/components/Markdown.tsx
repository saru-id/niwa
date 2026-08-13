import { createHighlighter } from '@tanstack/highlight/core'
import { json } from '@tanstack/highlight/languages/json'
import { plaintext } from '@tanstack/highlight/languages/plaintext'
import { shell } from '@tanstack/highlight/languages/shell'
import { toml } from '@tanstack/highlight/languages/toml'
import { createTanStackMarkdownHighlighter } from '@tanstack/highlight/markdown'
import { Markdown as TanStackMarkdown } from '@tanstack/markdown/react'
import type { ComponentNode, MarkdownExtension } from '@tanstack/markdown'
import * as stylex from '@stylexjs/stylex'
import type { ComponentPropsWithoutRef } from 'react'

import { luau } from '../lib/luau'
import { prepareTree, readTree, type TreeEntry } from '../lib/tree'
import { TreeBlock } from './TreeBlock'
import { Screen } from './Screen'

// One highlighter for the whole build. It is synchronous and holds no state
// between calls, so the module scope is the cheapest place for it.
const highlighter = createHighlighter({
  languages: [luau, shell, toml, json, plaintext],
})

// The bridge returns the inner token markup for a fence. TanStack Markdown
// owns the <pre> and <code> around it.
const highlight = createTanStackMarkdownHighlighter(highlighter)

const styles = stylex.create({
  block: {
    // The copy control is revealed by hover on the frame and by focus on
    // the control itself, so the frame publishes the hover and the control
    // reads it.
    '--copy-shown': {
      default: 0,
      ':hover': 1,
    },
    margin: '1.5rem 0',
    position: 'relative',
  },
  controls: {
    alignItems: 'center',
    display: 'flex',
    gap: '0.5rem',
    position: 'absolute',
    right: '0.5rem',
    top: '0.5rem',
  },
  badge: {
    color: 'var(--ink-muted)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-kicker)',
  },
  copy: {
    // Longhands throughout: StyleX 0.19 silently drops the `background`
    // and `border` shorthands, so a shorthand here styles nothing.
    backgroundColor: 'transparent',
    borderStyle: 'none',
    color: 'var(--ink-muted)',
    cursor: 'pointer',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-kicker)',
    // Eleven pixel type draws a box under the 24 pixel target minimum. The
    // padding grows the box and the equal negative margin gives the space
    // back to the layout, so the label sits where it always sat.
    margin: '-6px',
    opacity: {
      default: 'var(--copy-shown)',
      ':focus-visible': 1,
    },
    padding: '6px',
  },
  pre: {
    backgroundColor: 'var(--surface)',
    borderColor: 'var(--border)',
    borderStyle: 'solid',
    borderWidth: 1,
    borderRadius: '8px',
    color: 'var(--th-token)',
    fontSize: 'var(--text-code)',
    lineHeight: 1.6,
    margin: 0,
    overflowX: 'auto',
    padding: '1rem 1.25rem',
  },
  tableFrame: {
    borderColor: 'var(--border)',
    borderStyle: 'solid',
    borderWidth: 1,
    borderRadius: '8px',
    margin: '1.5rem 0',
    overflowX: 'auto',
  },
  table: {
    borderCollapse: 'collapse',
    fontSize: 'var(--text-table)',
    fontVariantNumeric: 'tabular-nums',
    width: '100%',
  },
})

/** Join a class the renderer set with the class StyleX compiled. */
function classes(...names: Array<string | undefined>): string | undefined {
  const joined = names.filter(Boolean).join(' ')
  return joined === '' ? undefined : joined
}

type PreProps = ComponentPropsWithoutRef<'pre'> & { 'data-lang'?: string }

function CodeBlock({ children, className, ...rest }: PreProps) {
  const lang = rest['data-lang']
  const frame = stylex.props(styles.pre)

  return (
    <div data-code-block="" {...stylex.props(styles.block)}>
      <div {...stylex.props(styles.controls)}>
        {/* The badge names the fence verbatim. A fence with no language and
          a fence declaring `plaintext` are the same thing downstream, and
          neither has anything to announce. */}
        {lang && lang !== 'plaintext' ? (
          <span {...stylex.props(styles.badge)}>{lang}</span>
        ) : null}
        {/* The label is its own element so the swap `copy.ts` makes has a
          live region to announce from. The button's name is still its
          contents, so the name changes with the label. */}
        <button data-copy="" type="button" {...stylex.props(styles.copy)}>
          <span data-copy-label="" role="status">
            Copy
          </span>
        </button>
      </div>
      {/* A fence wider than its column scrolls sideways, and the tab stop is
        what lets a keyboard reach the part that is off screen. */}
      <pre
        {...rest}
        className={classes(className, frame.className)}
        style={frame.style}
        tabIndex={0}
      >
        {children}
      </pre>
    </div>
  )
}

/* A header row labels its column; it is not prose. Pagefind joins cell text
 * with no separator, so indexed it reads "FlagArgumentMeaning" inside an
 * excerpt. It stays on the page and leaves the index. */
function TableHead(props: ComponentPropsWithoutRef<'thead'>) {
  return <thead {...props} data-pagefind-ignore />
}

function ScrollableTable({ className, ...rest }: ComponentPropsWithoutRef<'table'>) {
  const framed = stylex.props(styles.table)

  return (
    // The wrapper is the scroll container, so the wrapper takes the tab stop.
    <div {...stylex.props(styles.tableFrame)} tabIndex={0}>
      <table
        {...rest}
        className={classes(className, framed.className)}
        style={framed.style}
      />
    </div>
  )
}

/* Every link the renderer builds or the author wrote.
 *
 * One of them is not the author's: the heading anchor, whose text is `#`.
 * A reader listening to a list of links gets no destination from that, and
 * Pagefind indexes it into the heading it sits in. The label names the
 * anchor and the ignore keeps it out of the index.
 */
function Anchor({ children, className, ...rest }: ComponentPropsWithoutRef<'a'>) {
  if (className === undefined || !className.includes('anchor-heading')) {
    return (
      <a className={className} {...rest}>
        {children}
      </a>
    )
  }
  return (
    <a
      className={className}
      {...rest}
      aria-label="Link to this section"
      data-pagefind-ignore=""
    >
      {/* The anchor is a child of the heading, so its glyph would otherwise
        join the heading's name. Hidden, the heading keeps its own words and
        the link keeps the label above. */}
      <span aria-hidden="true">{children}</span>
    </a>
  )
}

/* The screen fence.
 *
 * A fence whose info string is `screen` is not code. It is one screen the
 * tool printed, and its body is a reference to that screen, never the output
 * itself: documentation does not invent output.
 *
 *     ```screen
 *     fixture: plan_pending_color
 *     command: niwa plan
 *     ```
 *
 * The first line names a snapshot in `tests/snapshots/`, without insta's
 * `snapshots__` prefix and `.snap` suffix. The second line is optional: it is
 * the command line the caption prints in front of the fixture's path. There
 * is no third line, and no other key. `Screen` reads the fixture at build
 * time, so a fence that says anything else stops the build.
 *
 * A screen stands on its own. A fence nested in a list or a quote is left as
 * written, and shows as a code block.
 */

/** The value of `name: value` on one line of a screen fence, or null. */
function field(line: string, name: string): string | null {
  const prefix = `${name}:`
  if (!line.startsWith(prefix)) return null
  const value = line.slice(prefix.length).trim()
  return value === '' ? null : value
}

function malformed(file: string, problem: string): never {
  throw new Error(
    `Reading a screen fence in ${file}. ${problem} Name the snapshot on the ` +
      'first line as `fixture: <name>`, and the command, if there is one, on ' +
      'a second line as `command: <command line>`. The site did not build.',
  )
}

/** One screen fence, read into the props `Screen` takes. */
function screen(body: string, file: string): ComponentNode {
  const lines = body.trim().split('\n')
  if (lines.length > 2) {
    malformed(file, `It carries ${lines.length} lines, and a screen has one or two.`)
  }
  const fixture = field(lines[0] ?? '', 'fixture')
  if (fixture === null) {
    malformed(file, `Its first line is "${lines[0] ?? ''}", which names no fixture.`)
  }
  const second = lines[1]
  const command = second === undefined ? null : field(second, 'command')
  if (second !== undefined && command === null) {
    malformed(file, `Its second line is "${second}", which is not a command.`)
  }
  return {
    type: 'component',
    name: 'screen',
    attributes: {},
    children: [],
    tagName: 'screen',
    properties: command === null ? { fixture } : { fixture, command },
  }
}

/* The tree fence.
 *
 * A fence whose info string is `tree` is a directory structure, rendered by
 * the tree component the rest of the site uses. Two bodies are legal:
 *
 *     ```tree
 *     label: ~/.config/niwa
 *     init.luau — the config that runs
 *     modules/dev.luau
 *     ```
 *
 *     ```tree
 *     label: the example config
 *     root: tests/fixtures/example
 *     ```
 *
 * The first line is always `label:`, the caption. A `root:` second line
 * names a directory from the repository root and the structure shown is the
 * structure on disk, read at build time. Otherwise every following line is a
 * path (a trailing `/` marks an empty directory), optionally followed by
 * ` — ` and its one-line purpose, which renders beside the tree, never
 * inside it.
 */
function badTree(file: string, problem: string): never {
  throw new Error(
    `Reading a tree fence in ${file}. ${problem} The first line names the ` +
      'caption as `label: <caption>`; then either `root: <directory>` or ' +
      'one path per line, each optionally followed by the em dash and its ' +
      'purpose. The site did not build.',
  )
}

function treeFence(body: string, file: string): ComponentNode {
  const lines = body.trim().split('\n')
  const label = field(lines[0] ?? '', 'label')
  if (label === null) {
    badTree(file, `Its first line is "${lines[0] ?? ''}", which names no label.`)
  }
  const rest = lines.slice(1)
  const root = rest.length === 1 ? field(rest[0] ?? '', 'root') : null
  let entries: TreeEntry[]
  if (root !== null) {
    entries = readTree(root)
  } else {
    if (rest.length === 0) badTree(file, 'It names no paths and no root.')
    entries = rest.map((line) => {
      const split = line.split(' — ')
      const path = (split[0] ?? '').trim()
      if (path === '') badTree(file, 'It carries an empty path line.')
      const note = split.slice(1).join(' — ').trim()
      return note === '' ? { path } : { path, note }
    })
  }
  return {
    type: 'component',
    name: 'tree',
    attributes: {},
    children: [],
    tagName: 'tree',
    // Properties carry strings, so the entries travel serialized.
    properties: { label, spec: JSON.stringify(entries) },
  }
}

/** The `tree` component the fence above becomes. */
function TreeFence({ label, spec }: { label: string; spec: string }) {
  const entries = JSON.parse(spec) as TreeEntry[]
  return <TreeBlock tree={prepareTree(entries)} label={label} />
}

/** The fence gate, bound to the file whose name a failure has to carry. */
function screenFences(file: string): MarkdownExtension {
  return {
    name: 'screen',
    transformDocument: (document) => ({
      ...document,
      children: document.children.map((node) => {
        if (node.type !== 'code') return node
        if (node.lang === 'screen') return screen(node.value, file)
        if (node.lang === 'tree') return treeFence(node.value, file)
        return node
      }),
    }),
  }
}

/**
 * A markdown document, rendered to HTML at build time.
 *
 * Nothing here reaches the browser: the page renders this component with no
 * client directive, so React runs once, during the build. `headingIds` must
 * stay set — `collectHeadings` in `lib/headings.ts` links to the ids it
 * stamps.
 *
 * `file` is the markdown file's own path, and a fence the build refuses names
 * it. Markdown written inside a page has no file to name, so it is optional.
 */
export function Markdown({
  source,
  file = 'markdown written inside a page',
}: {
  source: string
  file?: string
}) {
  return (
    <TanStackMarkdown
      components={{
        a: Anchor,
        pre: CodeBlock,
        screen: Screen,
        table: ScrollableTable,
        thead: TableHead,
        tree: TreeFence,
      }}
      extensions={[screenFences(file)]}
      headingAnchors={{ ariaHidden: false, tabIndex: 0 }}
      headingIds
      highlighter={highlight}
    >
      {source}
    </TanStackMarkdown>
  )
}

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
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
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
    letterSpacing: '0.1em',
    opacity: {
      default: 'var(--copy-shown)',
      ':focus-visible': 1,
    },
    padding: 0,
    textTransform: 'uppercase',
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
        <button data-copy="" type="button" {...stylex.props(styles.copy)}>
          copy
        </button>
      </div>
      <pre
        {...rest}
        className={classes(className, frame.className)}
        style={frame.style}
      >
        {children}
      </pre>
    </div>
  )
}

function ScrollableTable({ className, ...rest }: ComponentPropsWithoutRef<'table'>) {
  const framed = stylex.props(styles.table)

  return (
    <div {...stylex.props(styles.tableFrame)}>
      <table
        {...rest}
        className={classes(className, framed.className)}
        style={framed.style}
      />
    </div>
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

/** The fence gate, bound to the file whose name a failure has to carry. */
function screenFences(file: string): MarkdownExtension {
  return {
    name: 'screen',
    transformDocument: (document) => ({
      ...document,
      children: document.children.map((node) =>
        node.type === 'code' && node.lang === 'screen' ? screen(node.value, file) : node,
      ),
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
      components={{ pre: CodeBlock, screen: Screen, table: ScrollableTable }}
      extensions={[screenFences(file)]}
      headingAnchors={{ ariaHidden: false, tabIndex: 0 }}
      headingIds
      highlighter={highlight}
    >
      {source}
    </TanStackMarkdown>
  )
}

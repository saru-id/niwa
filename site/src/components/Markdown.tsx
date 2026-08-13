import { createHighlighter } from '@tanstack/highlight/core'
import { json } from '@tanstack/highlight/languages/json'
import { plaintext } from '@tanstack/highlight/languages/plaintext'
import { shell } from '@tanstack/highlight/languages/shell'
import { toml } from '@tanstack/highlight/languages/toml'
import { createTanStackMarkdownHighlighter } from '@tanstack/highlight/markdown'
import { Markdown as TanStackMarkdown } from '@tanstack/markdown/react'
import * as stylex from '@stylexjs/stylex'
import type { ComponentPropsWithoutRef } from 'react'

import { luau } from '../lib/luau'

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
    background: 'none',
    border: 0,
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
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    color: 'var(--th-token)',
    fontSize: 'var(--text-code)',
    lineHeight: 1.6,
    margin: 0,
    overflowX: 'auto',
    padding: '1rem 1.25rem',
  },
  tableFrame: {
    border: '1px solid var(--border)',
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

/**
 * A markdown document, rendered to HTML at build time.
 *
 * Nothing here reaches the browser: the page renders this component with no
 * client directive, so React runs once, during the build. `headingIds` must
 * stay set — `collectHeadings` in `lib/headings.ts` links to the ids it
 * stamps.
 */
export function Markdown({ source }: { source: string }) {
  return (
    <TanStackMarkdown
      components={{ pre: CodeBlock, table: ScrollableTable }}
      headingAnchors={{ ariaHidden: false, tabIndex: 0 }}
      headingIds
      highlighter={highlight}
    >
      {source}
    </TanStackMarkdown>
  )
}

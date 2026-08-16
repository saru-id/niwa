/* One screen the tool printed, reproduced on the page.
 *
 * The component runs at build time only: it reads a snapshot fixture from the
 * tool's own tree. It must never carry a `client:*` directive. A `.tsx` and
 * not an `.astro` because StyleX transforms JavaScript-like files only, so a
 * component with styles of its own has to be one; Astro renders it to static
 * HTML with no directive, which is the whole client budget the brief allows.
 */

import * as stylex from '@stylexjs/stylex'
import { Fragment } from 'react'
import { readScreen } from '../lib/terminal'
import { EXHIBIT } from '../styles/frames.stylex'

const styles = stylex.create({
  // Inside the exhibit's box the screen draws nothing of its own: no second
  // background and no rules, because the tool draws its rules with
  // characters.
  screen: {
    color: 'var(--ink)',
    fontSize: 'var(--text-output)',
    lineHeight: 1.5,
    margin: 0,
    // Alignment is part of the tool's language, so a line scrolls; it never
    // wraps. The tab stop lets a keyboard reach the scroll.
    whiteSpace: 'pre',
  },
  caption: {
    color: 'var(--ink-muted)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-meta)',
    marginTop: '0.5rem',
  },
  // Bold marks an identifier. A role's color outranks it, as on a terminal.
  bold: {
    color: 'var(--ink-strong)',
    fontWeight: 600,
  },
})

const roles = stylex.create({
  good: { color: 'var(--role-good)' },
  warn: { color: 'var(--role-warn)' },
  bad: { color: 'var(--role-bad)' },
  muted: { color: 'var(--role-muted)' },
  accent: { color: 'var(--role-accent)' },
})

/**
 * `provenance` is the snapshot's own path, printed under the screen.
 *
 * The documentation prints it, because a page that quotes the tool should
 * say which run it quoted and a reader should be able to open the file. The
 * landing does not: three lines of `tests/snapshots/snapshots__…` under a
 * four-line screen is more path than screen, and that page says where its
 * screens come from once, in a sentence, rather than under every one.
 */
export function Screen({
  fixture,
  command,
  provenance = true,
}: {
  fixture: string
  command?: string
  provenance?: boolean
}) {
  const screen = readScreen(fixture)
  const caption = provenance
    ? command === undefined
      ? screen.source
      : `${command} · ${screen.source}`
    : command
  return (
    <figure {...stylex.props(EXHIBIT.block)}>
      <pre {...stylex.props(EXHIBIT.frame, EXHIBIT.air, styles.screen)} tabIndex={0}>
        <samp>
          {screen.lines.map((line, index) => (
            <Fragment key={index}>
              {line.map((span, position) => (
                <span
                  key={position}
                  {...stylex.props(span.bold && styles.bold, span.role && roles[span.role])}
                  {...(span.mark === null ? {} : { role: 'img', 'aria-label': span.mark })}
                >
                  {span.text}
                </span>
              ))}
              {index === screen.lines.length - 1 ? null : '\n'}
            </Fragment>
          ))}
        </samp>
      </pre>
      {caption === undefined ? null : (
        <figcaption {...stylex.props(styles.caption)}>{caption}</figcaption>
      )}
    </figure>
  )
}

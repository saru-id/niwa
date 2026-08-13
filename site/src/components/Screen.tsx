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

const styles = stylex.create({
  figure: {
    marginBlock: '1.5rem',
    marginInline: 0,
  },
  // The frame the site's code blocks wear. No background inside the screen
  // and no borders inside it: the tool draws its own rules with characters.
  screen: {
    backgroundColor: 'var(--surface)',
    borderColor: 'var(--border)',
    borderRadius: 8,
    borderStyle: 'solid',
    borderWidth: 1,
    color: 'var(--ink)',
    fontSize: 'var(--text-output)',
    lineHeight: 1.5,
    margin: 0,
    // Alignment is part of the tool's language, so a line scrolls; it never
    // wraps. The tab stop lets a keyboard reach the scroll.
    overflowX: 'auto',
    paddingBlock: '1rem',
    paddingInline: '1.25rem',
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

export function Screen({ fixture, command }: { fixture: string; command?: string }) {
  const screen = readScreen(fixture)
  return (
    <figure {...stylex.props(styles.figure)}>
      <pre {...stylex.props(styles.screen)} tabIndex={0}>
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
      <figcaption {...stylex.props(styles.caption)}>
        {command === undefined ? screen.source : `${command} · ${screen.source}`}
      </figcaption>
    </figure>
  )
}

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/* `astryx-reset.css` carries the design system's reset under `@scope`.
 * A copy drifts, so this gate reads both files and compares them.
 *
 * The comparison is by selector, not by text. Every selector the shipped
 * reset declares must appear in ours, or be named below as one the site
 * refuses. A design system upgrade that adds a rule fails here, which is
 * the moment to decide whether components need it.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

const SHIPPED = require.resolve('@astryxdesign/core/reset.css')
const OURS = path.join(HERE, 'astryx-reset.css')

/* The rules the site does not carry, each with its reason.
 *
 * All five are the document itself. A reset scoped inside the page cannot
 * restyle `<html>` or `<body>`, and the three `color-scheme` rules belong
 * to the theme control, which `app.css` owns.
 *
 * The shipped reset also sets `box-sizing` on every element. That selector
 * is carried, for the border rules, and `app.css` sets `box-sizing` on
 * every element of the site already.
 */
const REFUSED = new Map<string, string>([
  [':where(html)', 'the site owns the document element'],
  [':where(body)', 'the site owns the body'],
  [':where(html[data-theme=light])', 'app.css sets color-scheme'],
  [':where(html[data-theme=dark])', 'app.css sets color-scheme'],
  [':where(html:not([data-theme]))', 'app.css sets color-scheme'],
])

/** Every selector a stylesheet declares, comments and at-rules removed.
 *
 * A block's prelude is the text since the last brace or semicolon. That is
 * all the reading this needs: both files are hand-written CSS, and a
 * prelude is either a selector or an at-rule.
 */
function selectors(css: string): string[] {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const found: string[] = []
  let prelude = ''

  for (const character of withoutComments) {
    if (character === '{') {
      const selector = prelude.trim()
      if (selector !== '' && !selector.startsWith('@')) {
        // Quote style and the space around a combinator are spelling, not
        // meaning. Both files are compared with neither.
        found.push(
          selector
            .replace(/["']/g, '')
            .replace(/\s+/g, ' ')
            .replace(/\s*([,>+~])\s*/g, '$1'),
        )
      }
      prelude = ''
    } else if (character === '}' || character === ';') {
      prelude = ''
    } else {
      prelude += character
    }
  }

  return found
}

describe('the scoped reset', () => {
  const shipped = selectors(readFileSync(SHIPPED, 'utf8'))
  const ours = new Set(selectors(readFileSync(OURS, 'utf8')))

  it('reads both stylesheets', () => {
    expect(shipped.length).toBeGreaterThan(20)
    expect(ours.size).toBeGreaterThan(20)
  })

  it('carries every rule the design system ships, or refuses it by name', () => {
    const missing = shipped.filter(
      (selector) => !ours.has(selector) && !REFUSED.has(selector),
    )
    expect(missing).toEqual([])
  })

  it('refuses only rules the design system still ships', () => {
    const stale = [...REFUSED.keys()].filter((selector) => !shipped.includes(selector))
    expect(stale).toEqual([])
  })
})

// The built CSS says what the source meant.
//
// lightningcss folds an `animation` shorthand into its neighbouring
// `animation-timeline`, and the shorthand cannot carry a timeline, so the
// browser discards the declaration whole. Every scroll-driven animation on
// the landing went silent that way: the paths kept the dash offset that
// hides them and never got the animation that draws them.
//
// Nothing catches it upstream. The source is valid, `astro check` reads the
// source, and `astro dev` serves the CSS unminified, so the bug exists only
// in the built file. This reads that file.

import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ASSETS = path.join(SITE, 'dist/_astro')

let files = []
try {
  files = readdirSync(ASSETS).filter((file) => file.endsWith('.css'))
} catch {
  console.error('dist/_astro is missing. Run the build first.')
  process.exit(1)
}

const failures = []
let timelines = 0

for (const file of files) {
  const css = readFileSync(path.join(ASSETS, file), 'utf8')

  /* A folded declaration: the shorthand carrying a dashed-ident timeline.
   *
   * A shorthand may legitimately mention a custom property, as
   * `animation: trail-draw var(--sprout-reach) ease both` does, so the
   * `var()` calls come out before the value is judged. What the fold leaves
   * behind is a bare `--name` with no `var()` around it, and that is the
   * only thing a shorthand can never carry. */
  for (const match of css.matchAll(/animation:([^;}]*)[;}]/g)) {
    let value = match[1]
    let previous
    do {
      previous = value
      value = value.replace(/var\([^()]*\)/g, '')
    } while (value !== previous)
    if (/--[\w-]+/.test(value)) {
      failures.push(
        `${file}: the animation shorthand carries a timeline: ${match[0].slice(0, 72)}`,
      )
    }
  }

  timelines += [...css.matchAll(/animation-timeline:/g)].length
}

// A build that lost every timeline is the same bug wearing a different face.
if (timelines === 0) {
  failures.push('no animation-timeline survived the build; the landing has scroll-driven growth')
}

if (failures.length > 0) {
  for (const failure of failures) console.error(failure)
  console.error(
    '\nWrite the animation as longhands (animation-name, animation-timing-function,' +
      '\nanimation-fill-mode) beside animation-timeline. The shorthand cannot carry one.',
  )
  process.exit(1)
}

console.log(`${timelines} animation-timeline declarations survived the build intact.`)

// Every encoded derivative in the build sits under its budget.
//
// The qualities in `src/lib/hero-art.ts` are measured budgets, and this is
// what holds the build to them: a quality raised by hand, or an art file
// swapped for a heavier one, shows up here as a derivative that outgrew the
// weight the landing was designed around.
//
// The budget is a ceiling, not an exact size, and that is the whole
// correction. This check used to pin the byte count and say the encoder was
// deterministic. It is deterministic for one build of it — the same source
// and options on a different libavif produce a file a fraction of a percent
// apart, and every such fraction failed the gate. Measured on one commit:
//
//   derivative       pinned    CI runner   another mac
//   garden mobile    146678    146077      146347
//   garden desktop   242118    240965      241558
//   vine              44148     43486       43727
//   seedling          14390     14041       14169
//
// Nothing there is a regression; it is three builds of an encoder. Pinning
// the exact number turned a real budget into a machine fingerprint, and the
// first machine that was not the one which recorded it went red. A ceiling
// asks the question the budget was always asking, and answers it the same
// way everywhere.
//
// The ceilings sit a few percent over the heaviest build seen, which is far
// under what a raised quality or a new source file would add.

import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ASSETS = path.join(SITE, 'dist/_astro')

/*
 * One row per derivative the build must produce.
 *
 * `rank` orders a source's derivatives by weight, smallest first, because a
 * source with two of them is one image at two sizes and the byte count is no
 * longer the thing telling them apart.
 */
const BUDGETS = [
  { name: 'garden', rank: 0, ceiling: 152_000, says: 'the mobile hero encode' },
  { name: 'garden', rank: 1, ceiling: 250_000, says: 'the desktop hero encode' },
  { name: 'vine', rank: 0, ceiling: 46_000, says: 'the installer vine' },
  { name: 'seedling', rank: 0, ceiling: 15_000, says: 'the navigation seedling' },
]

let files = []
try {
  files = readdirSync(ASSETS).filter((file) => file.endsWith('.avif'))
} catch {
  console.error('dist/_astro is missing. Run the build first.')
  process.exit(1)
}

const sizes = files.map((file) => ({ file, bytes: statSync(path.join(ASSETS, file)).size }))

/** A source's derivatives, lightest first. */
function derivatives(name) {
  return sizes.filter((entry) => entry.file.startsWith(name)).sort((a, b) => a.bytes - b.bytes)
}

// A source that stopped producing a derivative, or started producing one
// more, is a build that changed shape. The ceilings alone would not see it.
const expected = new Map()
for (const budget of BUDGETS) expected.set(budget.name, (expected.get(budget.name) ?? 0) + 1)

const failures = []
const report = []

for (const [name, count] of expected) {
  const built = derivatives(name)
  if (built.length !== count) {
    failures.push(
      `${name}: expected ${count} derivative(s), the build has ${built.length}` +
        (built.length > 0 ? ` (${built.map((e) => e.file).join(', ')})` : ''),
    )
  }
}

for (const budget of BUDGETS) {
  const built = derivatives(budget.name)[budget.rank]
  if (built === undefined) continue
  const headroom = (((budget.ceiling - built.bytes) / budget.ceiling) * 100).toFixed(1)
  report.push(`  ${budget.says}: ${built.bytes} of ${budget.ceiling} (${headroom}% spare)`)
  if (built.bytes > budget.ceiling) {
    failures.push(
      `${budget.says}: ${built.file} is ${built.bytes} bytes, over its ${budget.ceiling} budget`,
    )
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(failure)
  console.error('\nAn encode outgrew its budget. Re-measure it before shipping the weight.')
  process.exit(1)
}

console.log(`${BUDGETS.length} encoded derivatives inside their budgets.`)
for (const line of report) console.log(line)

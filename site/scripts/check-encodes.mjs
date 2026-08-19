// Every encoded derivative in the build weighs what its budget says.
//
// The qualities in `src/lib/hero-art.ts` are measured budgets. The encoder
// is deterministic on one machine, but not across them: the same source,
// version and options land within a percent of each other on different
// platforms, never on the same byte. So a budget holds to two percent —
// wide enough for that drift, and far under the swing a changed quality or
// a moved encoder produces. A miss means one of those moved, and the image
// budgets need measuring again before the build can claim them.

import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ASSETS = path.join(SITE, 'dist/_astro')

/** Expected bytes per derivative, keyed by source name and a size marker. */
const PINNED = [
  { name: 'garden', bytes: 146347, says: 'the mobile hero encode' },
  { name: 'garden', bytes: 241558, says: 'the desktop hero encode' },
  { name: 'vine', bytes: 43727, says: 'the installer vine' },
  { name: 'seedling', bytes: 14169, says: 'the navigation seedling' },
]

let files = []
try {
  files = readdirSync(ASSETS).filter((file) => file.endsWith('.avif'))
} catch {
  console.error('dist/_astro is missing. Run the build first.')
  process.exit(1)
}

const sizes = files.map((file) => ({ file, bytes: statSync(path.join(ASSETS, file)).size }))
const failures = []

/** The share of a budget the platforms' encoders drift across. */
const TOLERANCE = 0.02

for (const pin of PINNED) {
  const match = sizes.find(
    (candidate) =>
      candidate.file.startsWith(pin.name) &&
      Math.abs(candidate.bytes - pin.bytes) <= pin.bytes * TOLERANCE,
  )
  if (match === undefined) {
    const near = sizes.filter((candidate) => candidate.file.startsWith(pin.name))
    const seen = near.length > 0 ? near.map((c) => `${c.file} at ${c.bytes}`).join(', ') : 'none'
    failures.push(
      `${pin.says}: no ${pin.name} derivative within 2% of ${pin.bytes} bytes (built: ${seen})`,
    )
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(failure)
  console.error('\nThe encoded weights moved. Re-measure the image budgets before shipping them.')
  process.exit(1)
}

console.log(`${PINNED.length} encoded derivatives at their measured weights.`)

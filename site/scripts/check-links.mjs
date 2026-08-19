// Every internal link on the built site names something the build wrote.
//
// The gate walks `dist/` after `astro build`, reads every `href` and `src` on
// every page, and resolves the ones that stay inside the site. A link to a
// page must name a file in `dist/`. A link carrying a fragment must also name
// an `id` on the page it lands on. External links are counted and never
// fetched: this gate reads the disk and nothing else.
//
// The pages are this repository's own output, so the extractor scans tags and
// attributes instead of parsing html. It skips the two places where a page
// holds text rather than markup: html comments, and the bodies of `script`
// and `style`.

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(SITE, 'dist')

// A base for `new URL`. Only the path of the result is ever read. The host is
// there because the browser's rules for a relative link need one, and
// `.invalid` can never resolve to a real machine.
const BASE = 'https://site.invalid'

// Five names locate a bad link. A missing page is linked from the sidebar on
// every page of the site, so naming them all would bury the list of targets
// under its own repetition.
const NAMES_SHOWN = 5

if (!existsSync(DIST)) {
  console.error(
    'Checking the built site for dangling links. There is no site/dist to read. ' +
      'Run `pnpm run build`, then run this gate again. ' +
      'Nothing was read and nothing was written.',
  )
  process.exit(1)
}

/** Every file under a directory, in a stable order. */
function filesUnder(directory) {
  const found = []
  const entries = readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )
  for (const entry of entries) {
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) found.push(...filesUnder(full))
    else found.push(full)
  }
  return found
}

/** The path a file in dist is served at, `/reference/index.html` style. */
function servedAt(file) {
  return `/${path.relative(DIST, file).split(path.sep).join('/')}`
}

/** What to call a page in a message: the address a reader would type. */
function nameOf(file) {
  const served = servedAt(file)
  if (served === '/index.html') return '/'
  if (served.endsWith('/index.html')) return served.slice(0, -'/index.html'.length)
  return served
}

const COMMENT = /<!--[\s\S]*?-->/g
const RAW_TEXT = /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi
const TAG = /<([a-zA-Z][^\s/>]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g
const ATTRIBUTE = /([^\s=/>"']+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g

const ENTITIES = { amp: '&', apos: "'", gt: '>', lt: '<', quot: '"' }

/** An attribute value as the browser reads it. */
function decode(value) {
  return value.replace(/&(amp|apos|gt|lt|quot);/g, (_, name) => ENTITIES[name])
}

/**
 * Percent-encoding is the wire form of a path. The files on disk and the ids
 * in the markup carry the plain text, so compare in plain text. A malformed
 * escape is left as written, and the link it belongs to then dangles by name.
 */
function plain(text) {
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

/**
 * The links and the ids of one page.
 *
 * `script` and `style` bodies are dropped before the scan. The search modal
 * ships its result template inside a `script`, and that template's `href` is a
 * placeholder the browser never resolves. Reading it would invent a link the
 * page does not have.
 */
function extract(source) {
  const ids = new Set()
  const links = []
  /* CodeQL reads the next line as an incomplete HTML sanitizer and reports
   * that `<script` or `<!--` could survive it. It could, and it does not
   * matter, because nothing here sanitizes anything.
   *
   * This gate reads the site's own `dist/` off the disk, pulls every `href`
   * and `src`, and checks each internal one names a file the build wrote. It
   * renders nothing and returns no markup. The stripped string goes to the
   * tag regex below, and what comes out is a list of link strings compared
   * against filenames. There is no HTML sink anywhere downstream, so a
   * surviving `<script` has nothing to be injected into.
   *
   * The two replacements are here to keep the extractor from reading a link
   * that the page does not have: the search modal ships its result markup
   * inside a `script`, and that template's `href` is a placeholder the
   * browser never resolves.
   *
   * The alerts are dismissed on those grounds. Reopen them if this ever
   * grows a path that emits HTML. */
  const body = source.replace(COMMENT, '').replace(RAW_TEXT, '')
  for (const tag of body.matchAll(TAG)) {
    for (const attribute of tag[2].matchAll(ATTRIBUTE)) {
      // Attribute names are case-insensitive, and `id` is the whole name. A
      // suffix does not count: `data-truncate-grid="true"` is not an id.
      const name = attribute[1].toLowerCase()
      const value = decode(attribute[2] ?? attribute[3] ?? attribute[4])
      if (name === 'id') ids.add(value)
      else if (name === 'href' || name === 'src') links.push(value.trim())
    }
  }
  return { ids, links }
}

/**
 * A link that leaves the site: it carries a scheme, or a host where a path
 * belongs.
 *
 * `https://github.com/saru/niwa` is the repository constant in `src/nav.ts`,
 * and its `#license` twin names an anchor on a page this repository does not
 * build. Both are external, so the gate counts them and fetches nothing. A
 * documentation gate must not need the network.
 */
function isExternal(value) {
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value) || value.startsWith('//')
}

const files = filesUnder(DIST)
const inDist = new Set(files.map(servedAt))

/**
 * The file in dist a path names, or null.
 *
 * The build writes a page as a directory holding an `index.html`, so
 * `/concepts/model`, `/concepts/model/` and `/concepts/model/index.html` all
 * name one file. Everything else in dist is named literally, and that one rule
 * carries the rest of the output without an exception:
 *
 *   - The markdown twins are files the build wrote, so `/probe.md` names
 *     `dist/probe.md`.
 *   - `/llms.txt` and `/install.sh` are files the build wrote.
 *   - The search assets under `/pagefind/` need no allowance either. Pagefind
 *     indexes the pages after Astro writes them, and this gate runs after
 *     both, so `dist/pagefind/` is on disk with its assets in it before the
 *     first link is read.
 */
function landing(urlPath) {
  if (inDist.has(urlPath)) return urlPath
  const index = urlPath.endsWith('/') ? `${urlPath}index.html` : `${urlPath}/index.html`
  return inDist.has(index) ? index : null
}

/** What a link needed the build to write, said as a path a person can open. */
function expectation(urlPath) {
  if (urlPath.endsWith('/')) return `The build wrote no dist${urlPath}index.html.`
  return `The build wrote no dist${urlPath}/index.html and no dist${urlPath}.`
}

const pages = new Map()
for (const file of files) {
  if (!file.endsWith('.html')) continue
  pages.set(servedAt(file), { name: nameOf(file), ...extract(readFileSync(file, 'utf8')) })
}

/** Each dangling target once, with the pages that link to it. */
const dangling = new Map()

function dangle(target, expected, from) {
  const found = dangling.get(target) ?? { expected, from: new Set() }
  found.from.add(from)
  dangling.set(target, found)
}

let internal = 0
let anchors = 0
let external = 0

for (const [served, page] of pages) {
  for (const value of page.links) {
    if (value === '') continue
    if (isExternal(value)) {
      external += 1
      continue
    }
    internal += 1

    const cut = value.indexOf('#')
    const written = cut === -1 ? value : value.slice(0, cut)
    const fragment = cut === -1 ? '' : plain(value.slice(cut + 1))
    // A bare fragment names this page. Anything else resolves the way a
    // browser resolves it, which drops any query string with the path.
    const target = written === '' ? served : plain(new URL(written, `${BASE}${served}`).pathname)

    const landed = landing(target)
    if (landed === null) {
      dangle(target, expectation(target), page.name)
      continue
    }
    if (fragment === '') continue

    // A fragment on a file that is not a page has no ids to name. `/probe.md`
    // is markdown, and markdown headings are not html ids.
    const destination = pages.get(landed)
    if (!destination) continue

    anchors += 1
    if (!destination.ids.has(fragment)) {
      // The target is named as a reader would write it, so every spelling of
      // one page groups under one entry.
      dangle(
        `${destination.name}#${fragment}`,
        `The page ${destination.name} exists and carries no id "${fragment}".`,
        page.name,
      )
    }
  }
}

if (dangling.size > 0) {
  console.error('Checking every internal link in site/dist.\n')
  for (const target of [...dangling.keys()].sort()) {
    const { expected, from } = dangling.get(target)
    const names = [...from].sort()
    const shown = names.slice(0, NAMES_SHOWN)
    const rest = names.length - shown.length
    const linked =
      rest === 0
        ? shown.join(', ')
        : `${shown.join(', ')} and ${rest} more ${rest === 1 ? 'page' : 'pages'}`
    console.error(`${target}\n  ${expected}\n  Linked from ${linked}.`)
  }
  const counted = dangling.size === 1 ? '1 target dangles' : `${dangling.size} targets dangle`
  console.error(
    `\n${counted} across ${pages.size} pages. ` +
      'Write the pages that are missing, or correct the links that name them, ' +
      'then run `pnpm run check:links` again. ' +
      'This gate only reads dist, so nothing on disk changed.',
  )
  process.exit(1)
}

console.log(
  `${pages.size} pages scanned, ${internal} internal links checked, ` +
    `${anchors} anchors checked, ${external} external links counted.`,
)

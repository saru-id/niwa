import react from '@astrojs/react'
import stylex from '@stylexjs/unplugin'
import { defineConfig } from 'astro/config'
import pagefind from 'astro-pagefind'
import { fileURLToPath } from 'node:url'
import { installScript } from './integrations/install-script'
import { pruneOrphanScripts } from './integrations/prune-orphan-scripts'

const snapshots = fileURLToPath(new URL('../tests/snapshots', import.meta.url))

type SnapshotDevServer = {
  watcher: {
    add: (path: string) => void
    on: (event: 'change', listener: (file: string) => void) => void
  }
  ws: { send: (message: { type: 'full-reload'; path: string }) => void }
}

/** The screens live above the site's Vite root, so reading them at render
 * time is not enough to make dev mode notice when a snapshot changes. */
const reloadSnapshots = () => ({
  name: 'niwa:reload-snapshots',
  configureServer(server: SnapshotDevServer) {
    server.watcher.add(snapshots)
    server.watcher.on('change', (file) => {
      if (file.startsWith(snapshots) && file.endsWith('.snap')) {
        server.ws.send({ type: 'full-reload', path: '*' })
      }
    })
  },
})

export default defineConfig({
  site: 'https://niwa.rs',
  output: 'static',
  build: { format: 'directory' },
  // The site renders markdown itself, so Astro's own renderer never runs and
  // its highlighter would only cost build time. Turning it off also keeps the
  // markdown processor Astro 7 ships irrelevant to this build.
  markdown: { syntaxHighlight: false },
  // Pagefind reads the built pages after they are written, so its index is a
  // fact about the output rather than a second description of the content. In
  // dev it serves whatever the last build indexed.
  // React is registered whole, so a `client:*` directive works where a
  // component needs the browser. Nothing on the site hydrates today, and
  // the last integration deletes the renderer's client entrypoint after the
  // build because no page names it. Its comment carries the reasoning.
  integrations: [react(), installScript(), pagefind(), pruneOrphanScripts()],
  vite: {
    // StyleX must transform sources before the React plugin the integration
    // adds, so it is declared here rather than through the integration, which
    // has no place to pass a Babel plugin. `treeshakeCompensation` keeps the
    // bundler from dropping modules that only export style definitions.
    plugins: [
      reloadSnapshots(),
      stylex.vite({
        treeshakeCompensation: true,
        /* Which stylesheet the collected rules are appended to.
         *
         * The build writes two: the one the shell's own CSS lands in, which
         * every page links, and the landing's, which only the landing links
         * on top of it. Every rule StyleX collects goes into one of them, and
         * left to choose the plugin takes whichever the bundle happens to
         * list first. Naming the sheet is what keeps a documentation page
         * from linking the one its rules are not in. The landing's is named
         * for its route; the sheet every page has is the other one.
         */
        cssInjectionTarget: (file) => !/(^|\/)index\.[^/]*\.css$/.test(file),
      }),
    ],
  },
})

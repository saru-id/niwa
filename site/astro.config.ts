import stylex from '@stylexjs/unplugin'
import { defineConfig } from 'astro/config'
import pagefind from 'astro-pagefind'
import { buildOnlyReact } from './integrations/build-only-react'
import { installScript } from './integrations/install-script'

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
  integrations: [buildOnlyReact(), installScript(), pagefind()],
  vite: {
    // StyleX must transform sources before the React plugin the integration
    // adds, so it is declared here rather than through the integration, which
    // has no place to pass a Babel plugin. `treeshakeCompensation` keeps the
    // bundler from dropping modules that only export style definitions.
    plugins: [stylex.vite({ treeshakeCompensation: true })],
  },
})

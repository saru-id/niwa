import { copyFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { AstroIntegration } from 'astro'

// The installer at the repository root is the only copy. The tool owns it and
// the drills exercise it, so the site reads it at build time instead of
// keeping a second version that could drift.
const SOURCE_FROM_ROOT = '../install.sh'
const OUTPUT_NAME = 'install.sh'

export function installScript(): AstroIntegration {
  let source: URL

  return {
    name: 'niwa:install-script',
    hooks: {
      // The check runs at config time so a missing script stops dev, check and
      // build alike, before any other work is done.
      'astro:config:done': ({ config }) => {
        source = new URL(SOURCE_FROM_ROOT, config.root)
        if (!existsSync(source)) {
          throw new Error(
            `The installer is missing. Expected it at ${fileURLToPath(source)}. ` +
              'The site copies that file into its output; it never keeps its own copy.',
          )
        }
      },
      'astro:build:done': ({ dir, logger }) => {
        const destination = new URL(OUTPUT_NAME, dir)
        copyFileSync(source, destination)
        logger.info(`copied ${fileURLToPath(source)} to /${OUTPUT_NAME}`)
      },
    },
  }
}

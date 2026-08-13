import { readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AstroIntegration } from 'astro'

/**
 * Deletes the scripts in `_astro/` that nothing on the built site names.
 *
 * Astro writes every registered renderer's client entrypoint into the
 * client build whether or not a component hydrates. React on this site
 * runs during the build, and what reaches the reader is HTML, so that
 * entrypoint is 191 KB of react-dom that no page loads. It used to be
 * removed by stripping the entrypoint out of the renderer, which also made
 * a `client:*` directive fail the build. The design system needs that
 * directive back for the components that carry state, so the strip is
 * gone.
 *
 * This runs after the build instead, and reads the output rather than
 * predicting it. A page that hydrates nothing pays nothing, a page that
 * hydrates keeps every chunk it names, and neither case needs a flag.
 *
 * A file is kept when its name appears in any built page or in any script
 * that survives. Astro and Vite write the hashed file name into the
 * importer, so a name is the whole reference and one pass over the output
 * finds every one of them. The link gate reads the same output afterwards
 * and fails on a reference to a file that is not there, which is what
 * makes an over-eager sweep loud instead of silent.
 */
export function pruneOrphanScripts(): AstroIntegration {
  return {
    name: 'niwa:prune-orphan-scripts',
    hooks: {
      'astro:build:done': ({ dir, logger }) => {
        const root = fileURLToPath(dir)
        const scripts = path.join(root, '_astro')
        if (!exists(scripts)) return

        const pages = files(root)
          .filter((file) => file.endsWith('.html'))
          .map((file) => readFileSync(file, 'utf8'))
          .join('\n')

        // A script's own text does not count as a reference to itself, so
        // the candidates are held apart from the pages and read one by one.
        const kept = new Map<string, string>()
        for (const name of readdirSync(scripts)) {
          if (name.endsWith('.js')) kept.set(name, readFileSync(path.join(scripts, name), 'utf8'))
        }

        // Removing a script can orphan the ones only it imported, so the
        // sweep repeats until a pass removes nothing.
        let removed = true
        while (removed) {
          removed = false
          for (const [name] of kept) {
            const named =
              pages.includes(name) ||
              [...kept].some(([other, text]) => other !== name && text.includes(name))
            if (named) continue
            kept.delete(name)
            rmSync(path.join(scripts, name))
            logger.info(`removed ${name}, which no page loads`)
            removed = true
          }
        }
      },
    },
  }
}

function exists(directory: string): boolean {
  try {
    return statSync(directory).isDirectory()
  } catch {
    return false
  }
}

/** Every file under a directory. */
function files(directory: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) found.push(...files(full))
    else found.push(full)
  }
  return found
}

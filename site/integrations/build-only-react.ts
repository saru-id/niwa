import react from '@astrojs/react'
import type { AstroIntegration } from 'astro'

/**
 * The React integration with its client entrypoint removed.
 *
 * Astro puts every registered renderer's client entrypoint into the browser
 * bundle whether or not a component hydrates, so the build emitted 191 KB
 * of react-dom that no page referenced. React on this site runs once,
 * during the build, and what reaches the reader is HTML. Removing the
 * entrypoint deletes the orphan and makes the rule enforceable: a
 * `client:*` directive now fails the build instead of quietly shipping a
 * framework.
 */
export function buildOnlyReact(): AstroIntegration {
  const integration = react()
  const setup = integration.hooks['astro:config:setup']

  return {
    ...integration,
    hooks: {
      ...integration.hooks,
      'astro:config:setup': (options) =>
        setup?.({
          ...options,
          addRenderer: (renderer) =>
            options.addRenderer({ ...renderer, clientEntrypoint: undefined }),
        }),
    },
  }
}

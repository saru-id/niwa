import { isCommandLineFetch } from './recognize'
import { releaseRedirect } from './release'

interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> }
}

const SCRIPT_PATH = '/install.sh'
const SCRIPT_TYPE = 'text/x-shellscript; charset=utf-8'
// Five minutes. Long enough that a burst of installs reuses the stored
// answer, short enough that a re-tagged release reaches the next reader the
// same hour. The redirect reads nothing but the path, so any cache may hold
// it.
const REDIRECT_CACHE = 'public, max-age=300'

/* The apex chooses between two bodies by who is asking, so no cache may hold
 * either answer: a stored page handed to an installer pipe breaks the
 * install, and a stored script handed to a browser is worse. The variant key
 * names the two headers the choice reads, for any cache that stores despite
 * the instruction: partitioned by what it read, it still cannot cross the
 * two audiences. */
const APEX_CACHE = 'no-store'
const APEX_VARY = 'Accept, User-Agent'

/** The response as the apex sends it: the asset's own headers stand, and the
 * two cache headers above replace whatever the store would have cached it
 * as. */
function apex(body: BodyInit | null, from: Response): Response {
  const response = new Response(body, from)
  response.headers.set('Cache-Control', APEX_CACHE)
  response.headers.set('Vary', APEX_VARY)
  return response
}

// Two paths reach this Worker, and wrangler.toml names both.
//
// The apex answers `curl -fsSL niwa.rs | sh` with the installer and a browser
// with the landing page. `/release/…` is sent on to where the binaries live.
// Every other path is static assets and never runs any of this.
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url)

    // The releases are not assets, so this is answered before the store is
    // asked and before `not_found_handling` turns a miss into the 404 page.
    const release = releaseRedirect(pathname)
    if (release !== undefined) {
      return new Response(null, {
        status: 302,
        headers: { Location: release, 'Cache-Control': REDIRECT_CACHE },
      })
    }

    /* The apex, and only the apex, answers two audiences from one URL.
     *
     * The path test is not decoration. This Worker used to run for `/` and
     * nothing else, so the recognition below could assume the apex and read
     * headers alone. It runs for `/release/*` now as well, and without this
     * line a release name that did not match — a typo, a probe, an
     * architecture that was never built — fell through to the recognition,
     * saw curl, and answered a download request with the installer under a
     * 200. A request for a tarball must never be given a shell script.
     *
     * The method test is the same rule for verbs: only a read has two
     * representations to choose between. Anything else goes to the asset
     * store, whose refusal is the honest answer.
     */
    const read = request.method === 'GET' || request.method === 'HEAD'
    const headers = request.headers
    if (pathname !== '/' || !read) {
      return env.ASSETS.fetch(request)
    }

    if (!isCommandLineFetch(headers.get('user-agent'), headers.get('accept'))) {
      const page = await env.ASSETS.fetch(request)
      return apex(page.body, page)
    }

    // The script is fetched as a read of its own, so the store's headers for
    // it — the entity tag and the security set — carry over to the apex
    // answer. Only the type is pinned here: the apex promises a shell
    // script, and that promise must not rest on a header file elsewhere.
    const script = new URL(SCRIPT_PATH, request.url)
    const asset = await env.ASSETS.fetch(new Request(script, { method: 'GET' }))
    if (!asset.ok) {
      // A store with no installer is a broken deploy, but the failure is
      // still an apex answer: it is negotiated, so it is never stored.
      return apex(asset.body, asset)
    }

    // A HEAD answer carries the same headers and no body.
    const response = apex(request.method === 'HEAD' ? null : asset.body, asset)
    response.headers.set('Content-Type', SCRIPT_TYPE)
    return response
  },
}

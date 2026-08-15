import { isCommandLineFetch } from './recognize'
import { releaseRedirect } from './release'

interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> }
}

const SCRIPT_PATH = '/install.sh'
const SCRIPT_TYPE = 'text/x-shellscript; charset=utf-8'
// Five minutes. Long enough that a burst of installs is served from cache,
// short enough that a corrected installer reaches the next reader the same
// hour.
const SCRIPT_CACHE = 'public, max-age=300'

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
        headers: { Location: release, 'Cache-Control': SCRIPT_CACHE },
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
     */
    const headers = request.headers
    if (pathname !== '/' || !isCommandLineFetch(headers.get('user-agent'), headers.get('accept'))) {
      return env.ASSETS.fetch(request)
    }

    const script = new URL(SCRIPT_PATH, request.url)
    const asset = await env.ASSETS.fetch(new Request(script, { method: 'GET' }))
    if (!asset.ok) {
      return asset
    }

    return new Response(asset.body, {
      status: asset.status,
      headers: { 'Content-Type': SCRIPT_TYPE, 'Cache-Control': SCRIPT_CACHE },
    })
  },
}

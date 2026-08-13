import { isCommandLineFetch } from './recognize'

interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> }
}

const SCRIPT_PATH = '/install.sh'
const SCRIPT_TYPE = 'text/x-shellscript; charset=utf-8'
// Five minutes. Long enough that a burst of installs is served from cache,
// short enough that a corrected installer reaches the next reader the same
// hour.
const SCRIPT_CACHE = 'public, max-age=300'

// The apex answers `curl -fsSL niwa.rs | sh` with the installer and a browser
// with the landing page. Every other path is static assets and never reaches
// this Worker: wrangler.toml runs the Worker first for "/" only.
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const headers = request.headers
    if (!isCommandLineFetch(headers.get('user-agent'), headers.get('accept'))) {
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

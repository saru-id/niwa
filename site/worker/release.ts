/* Where a release actually lives.
 *
 * `install.sh` fetches `https://niwa.rs/release/<name>` and follows
 * redirects, so the apex only has to point at the bytes rather than hold
 * them. It points at GitHub Releases: that is free and unmetered for a
 * public repository, it is built for binaries, and it keeps them out of the
 * site's asset upload and out of git history. The install URL stays on
 * niwa.rs whatever the store is, which is the whole reason it is written
 * that way.
 *
 * The version is not taken from anywhere except the file name, because the
 * file name is the only thing that knows it. `NIWA_VERSION` pins an older
 * release, and a redirect fixed at the latest tag would answer that request
 * with the wrong release's 404.
 *
 * The pattern is strict on purpose. This builds a URL out of a path a
 * stranger controls, so anything that is not exactly a release file name is
 * refused rather than escaped: no traversal, no separators, no second
 * extension. What does not match gets no redirect, and the site's own 404
 * answers instead.
 */

/** The repository the releases hang from. `release.test.ts` binds this to
 * `SITE.repository`, so the two cannot drift apart. */
export const RELEASE_REPO = 'saru-id/niwa'

/* `niwa-<version>-macos-<arch>.tar.gz`, and the checksum beside it.
 *
 * The architectures are the two `uname -m` prints on macOS, which is what
 * `install.sh` interpolates — not the Rust target triples, which spell the
 * same two machines differently. */
const RELEASE_FILE =
  /^niwa-(\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?)-macos-(?:arm64|x86_64)\.tar\.gz(?:\.sha256)?$/

/**
 * The address a `/release/…` request should be sent to, or `undefined` when
 * the path is not a release file and the request is not ours to answer.
 */
export function releaseRedirect(pathname: string): string | undefined {
  const prefix = '/release/'
  if (!pathname.startsWith(prefix)) return undefined

  const name = pathname.slice(prefix.length)
  const match = RELEASE_FILE.exec(name)
  if (match === null) return undefined

  const version = match[1]
  return `https://github.com/${RELEASE_REPO}/releases/download/v${version}/${name}`
}

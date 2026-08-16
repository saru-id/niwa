/* The address a page answers at.
 *
 * The build writes every page as `folder/index.html` (`build.format` is
 * 'directory'), so a page is served from a directory and its one true URL
 * ends in a slash. A path whose last segment names a file keeps that name:
 * such a route is a file and has no directory form.
 */

/** The absolute URL of a path on this site, in the form the build serves. */
export function canonicalUrl(pathname: string): string {
  // The origin is read per call. A module-scope read binds the value at
  // import, before a test's environment can set it.
  const origin = import.meta.env.SITE
  const last = pathname.slice(pathname.lastIndexOf('/') + 1)
  const path = last.includes('.') || pathname.endsWith('/') ? pathname : `${pathname}/`
  return new URL(path, origin).href
}

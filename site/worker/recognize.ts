// The apex serves two audiences from one URL. This function decides which one
// is asking, from headers alone, so the decision can be tested without a
// running Worker.
//
// Two signals, either one is enough. The user agent names a command line
// fetcher, or the request does not ask for HTML. A browser always sends an
// Accept header that contains text/html, so a missing Accept header is a
// command line fetcher too.
export function isCommandLineFetch(
  userAgent: string | null | undefined,
  accept: string | null | undefined,
): boolean {
  const agent = (userAgent ?? '').toLowerCase()
  if (agent.startsWith('curl') || agent.startsWith('wget')) {
    return true
  }
  return !(accept ?? '').toLowerCase().includes('text/html')
}

# The niwa site

The landing page and the documentation for niwa, at niwa.rs. Astro builds
it to static HTML. A small Cloudflare Worker sits in front of the apex so
that `curl -fsSL niwa.rs | sh` receives the installer and a browser
receives the page. It also redirects `/release/…` to where the release
files live. Every other path is a static asset.

## Building it

Run `make site-check` from the repository root. It installs from the
lockfile, then runs the whole gate: `astro check`, the native typecheck,
the Luau snippets against the shipped types, the command reference
against the tool's own help, the tests, and a build. Two steps read what
the build wrote: the internal links, and the weight of every encoded
image. Run `make site-dev` for the dev server.

Inside this directory the same commands are `pnpm run check` and
`pnpm run dev`. Use pnpm. Every dependency is pinned to an exact version,
because several of them are alpha or beta and treat a minor as breaking.

Search is built by the build. Pagefind indexes the finished pages and
writes the index, its runtime and its stylesheet into `dist/pagefind/`,
and the dev server serves that directory as it stands. So search in dev
answers from the last build: run one before you rely on it, and run
another after changing what a page says.

The installer at the repository root is the only copy of `install.sh`. The
build copies it into the output, and fails if it is not there. Never add a
second copy under `public/`.

## Why there are two TypeScript compilers

`astro check` reads TypeScript's programmatic API to understand `.astro`
files. The native compiler in the 7.x line does not ship that API yet, and
`@astrojs/check` accepts only 5.x or 6.x. So `typescript` resolves to
6.0.3, which is what `astro check` and editors load.

The native compiler is installed beside it as `typescript-7`, and checks
the plain `.ts` and `.tsx` sources. The `typecheck` script calls it by
path rather than through `node_modules/.bin`, because both packages
declare a `tsc` binary and only one of them can win that name.

This ends when TypeScript ships the new API and `@astrojs/check` adopts
it. Then `typescript-7` becomes `typescript` and the sidecar goes away.

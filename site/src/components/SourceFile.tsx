import { File } from '@pierre/diffs/react'
import { preloadFile } from '@pierre/diffs/ssr'

/* A documentation page's own source, rendered as the file it is.
 *
 * There is no client directive on this and there never should be. Given
 * `prerenderedHTML`, the component's own server path emits declarative
 * shadow DOM — a `<template shadowrootmode="open">` the parser attaches
 * before anything runs — so the file arrives complete, highlighted, and
 * with no script at all. It is the same bargain the file trees already
 * take, and it is the reason this component can exist on a site that ships
 * almost no JavaScript.
 *
 * The theme is the pair, and the type is `system`. That combination is the
 * one that lets the site keep control: `system` writes no `color-scheme`
 * onto the shadow host, so the host inherits the document's, and the
 * document's is set by the same class on `<html>` that drives every other
 * colour on the page. The reader's choice moves this component with
 * everything else, through the control they already found.
 */

/** Both halves of the pair, so one render serves both themes. */
const THEME = { light: 'github-light', dark: 'github-dark' } as const

export async function renderSource(path: string, contents: string) {
  return await preloadFile({
    file: { name: path, contents },
    options: {
      theme: THEME,
      themeType: 'system',
      // A source view is for reading a specific line and saying which one,
      // so the numbers stay.
      disableLineNumbers: false,
      // Prose wraps. A markdown file is mostly sentences, and a horizontal
      // scrollbar under a paragraph is a worse answer than a soft wrap.
      overflow: 'wrap',
      stickyHeader: true,
    },
  })
}

export function SourceFile(preloaded: Awaited<ReturnType<typeof renderSource>>) {
  return <File {...preloaded} />
}

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The wordmark is served as an image, and an image cannot take its colour
// from the theme. It ships once per ink instead. The two files are one
// drawing, and this is what holds them to that: redraw one alone and the
// mark stops matching itself in the other colour mode.

const ART = new URL('assets/art/', import.meta.url)

const read = (name: string): string => readFileSync(new URL(name, ART), 'utf8')

describe('the wordmark', () => {
  it('is one drawing in two inks', () => {
    const onDark = read('wordmark.svg')
    const onLight = read('wordmark-ink.svg')

    // The strongest ink each ground takes: the landing's `--ink-strong` on
    // the dark one, the documentation's on the light one.
    expect(onDark).toContain('fill="#f2efe7"')
    expect(onLight).toContain('fill="#0d0d0d"')

    // Everything else, the coral dot included, is the same file.
    expect(onLight.replace('#0d0d0d', '#f2efe7')).toBe(onDark)
  })
})

import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The link gate reads built HTML and resolves only the addresses it finds
// there. The manifest and the social image live under public/ as plain files,
// so this is the check that what they are and name is what the site serves.

const PUBLIC = new URL('../public/', import.meta.url)

const served = (directory: string): readonly string[] =>
  readdirSync(new URL(directory, PUBLIC))

describe('the web manifest', () => {
  const manifest = JSON.parse(readFileSync(new URL('niwa.webmanifest', PUBLIC), 'utf8'))

  it('installs the site from its root', () => {
    expect(manifest.start_url).toBe('/')
    expect(manifest.scope).toBe('/')
  })

  it('names icons the site serves', () => {
    const art = served('art/')
    expect(manifest.icons.length).toBeGreaterThan(0)
    for (const icon of manifest.icons as readonly { src: string }[]) {
      expect(icon.src.startsWith('/art/'), icon.src).toBe(true)
      // Name membership, not a filesystem probe: the local filesystem ignores
      // case and the host serving these does not.
      expect(art, icon.src).toContain(icon.src.slice('/art/'.length))
    }
  })
})

describe('the social image', () => {
  it('is a file under public', () => {
    expect(served('art/')).toContain('niwa-og.jpg')
  })
})

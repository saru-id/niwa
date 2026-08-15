import { describe, expect, test } from 'vitest'
import { SITE } from '../src/nav'
import { RELEASE_REPO, releaseRedirect } from './release'

const base = `https://github.com/${RELEASE_REPO}/releases/download`

describe('the release redirect', () => {
  test('sends a tarball to the tag its own name names', () => {
    expect(releaseRedirect('/release/niwa-0.1.0-macos-arm64.tar.gz')).toBe(
      `${base}/v0.1.0/niwa-0.1.0-macos-arm64.tar.gz`,
    )
  })

  test('sends the checksum to the same place as the file it checks', () => {
    expect(releaseRedirect('/release/niwa-0.1.0-macos-x86_64.tar.gz.sha256')).toBe(
      `${base}/v0.1.0/niwa-0.1.0-macos-x86_64.tar.gz.sha256`,
    )
  })

  // `NIWA_VERSION` pins an older release. A redirect fixed at the latest tag
  // would answer this with the wrong release, so the version is read from the
  // name every time.
  test('follows a pinned version to its own tag rather than the newest', () => {
    expect(releaseRedirect('/release/niwa-0.0.9-macos-arm64.tar.gz')).toBe(
      `${base}/v0.0.9/niwa-0.0.9-macos-arm64.tar.gz`,
    )
  })

  test('carries a prerelease suffix through to the tag', () => {
    expect(releaseRedirect('/release/niwa-1.0.0-rc.2-macos-arm64.tar.gz')).toBe(
      `${base}/v1.0.0-rc.2/niwa-1.0.0-rc.2-macos-arm64.tar.gz`,
    )
  })

  test('refuses anything that is not exactly a release file name', () => {
    for (const path of [
      '/release/',
      '/release/niwa.tar.gz',
      '/release/niwa-0.1.0-linux-arm64.tar.gz',
      '/release/niwa-0.1.0-macos-riscv.tar.gz',
      '/release/niwa-0.1.0-macos-arm64.zip',
      '/release/niwa-0.1.0-macos-arm64.tar.gz.sig',
      // A stranger controls this path, so a name that climbs out of the
      // directory or carries a separator must not build a URL at all.
      '/release/../../etc/passwd',
      '/release/nested/niwa-0.1.0-macos-arm64.tar.gz',
      '/release/niwa-0.1.0-macos-arm64.tar.gz?x=1',
      '/release/https://evil.example/niwa-0.1.0-macos-arm64.tar.gz',
    ]) {
      expect(releaseRedirect(path), path).toBeUndefined()
    }
  })

  test('answers nothing outside its own prefix', () => {
    for (const path of ['/', '/install.sh', '/start', '/releases/x', '/prerelease/x']) {
      expect(releaseRedirect(path), path).toBeUndefined()
    }
  })

  // The site links to the repository in its header and footer, and the
  // installer is sent to the same one. One name, checked here.
  test('points at the repository the site names', () => {
    expect(SITE.repository).toBe(`https://github.com/${RELEASE_REPO}`)
  })
})

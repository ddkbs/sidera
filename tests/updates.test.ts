import { describe, expect, it } from 'vitest'
import { compareVersions, newerRelease } from '../src/shared/updates'

describe('update check', () => {
  it('compares versions numerically', () => {
    expect(compareVersions('v0.10.0', '0.9.9')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0', '1.0')).toBe(0)
    expect(compareVersions('0.1.0', 'v0.2.0-beta.1')).toBeLessThan(0)
  })

  it('reports only newer, published releases on the repo', () => {
    const rel = { tag_name: 'v0.2.0', html_url: 'https://github.com/ddkbs/sidera/releases/tag/v0.2.0' }
    expect(newerRelease('0.1.0', rel)).toEqual({ version: '0.2.0', url: rel.html_url })
    expect(newerRelease('0.2.0', rel)).toBeNull()
    expect(newerRelease('0.1.0', { ...rel, prerelease: true })).toBeNull()
    expect(newerRelease('0.1.0', { ...rel, html_url: 'https://evil.example/x' })?.url).toBe('https://github.com/ddkbs/sidera/releases/latest')
    expect(newerRelease('0.1.0', null)).toBeNull()
  })
})

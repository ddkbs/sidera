import { describe, expect, it } from 'vitest'
import { assertPublicHttpUrl, isBlockedAddress, isSafeExternalUrl } from '../src/main/netGuard'

describe('isSafeExternalUrl', () => {
  it('allows only http(s) and mailto', () => {
    expect(isSafeExternalUrl('https://example.com')).toBe(true)
    expect(isSafeExternalUrl('mailto:a@b.c')).toBe(true)
    for (const url of ['file:///Applications/Calculator.app', 'smb://host/share', 'canvascl-file://files/x', 'javascript:alert(1)', 'x-apple.systempreferences:', 'nonsense'])
      expect(isSafeExternalUrl(url), url).toBe(false)
  })
})

describe('isBlockedAddress', () => {
  it('blocks loopback, private, link-local and reserved addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '[::1]', 'not-an-ip'])
      expect(isBlockedAddress(ip), ip).toBe(true)
  })

  it('allows public addresses', () => {
    for (const ip of ['93.184.216.34', '1.1.1.1', '2606:4700:4700::1111', '::ffff:1.1.1.1']) expect(isBlockedAddress(ip), ip).toBe(false)
  })
})

describe('assertPublicHttpUrl', () => {
  const resolveTo = (addrs: string[]) => async () => addrs

  it('rejects non-http schemes', async () => {
    await expect(assertPublicHttpUrl('file:///etc/passwd', resolveTo(['1.1.1.1']))).rejects.toThrow(/http/)
  })

  it('rejects local targets, including the MCP server and numeric IP tricks', async () => {
    for (const url of ['http://127.0.0.1:3845/mcp', 'http://localhost:3845/mcp', 'http://2130706433/', 'http://[::1]/', 'http://intranet/'])
      await expect(assertPublicHttpUrl(url, resolveTo(['1.1.1.1'])), url).rejects.toThrow(/private/)
  })

  it('rejects hostnames that resolve to a private address', async () => {
    await expect(assertPublicHttpUrl('https://rebind.example.com/', resolveTo(['1.1.1.1', '192.168.0.10']))).rejects.toThrow(/private/)
  })

  it('accepts public hosts', async () => {
    const url = await assertPublicHttpUrl('https://example.com/a?b=1', resolveTo(['93.184.216.34']))
    expect(url.hostname).toBe('example.com')
  })
})

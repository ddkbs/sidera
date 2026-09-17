import { lookup } from 'node:dns/promises'
import { BlockList, isIP } from 'node:net'

/**
 * SSRF guard for URLs the app fetches on behalf of the renderer or MCP clients (link previews, web clipper,
 * preview images). Blocks loopback (incl. our own MCP server on 127.0.0.1), private, link-local, CGNAT,
 * multicast and reserved ranges. No Electron imports so it can be unit tested.
 */
const blocked = new BlockList()
const V4: [string, number][] = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4]
]
// ::/96 covers ::, ::1 and deprecated IPv4-compatible addresses
const V6: [string, number][] = [['::', 96], ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8]]
for (const [net, prefix] of V4) blocked.addSubnet(net, prefix, 'ipv4')
for (const [net, prefix] of V6) blocked.addSubnet(net, prefix, 'ipv6')

/** `::ffff:127.0.0.1` / `::ffff:7f00:1` → `127.0.0.1`, else null. */
function mappedV4(ip: string): string | null {
  const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip)
  if (dotted) return dotted[1]
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(ip)
  if (!hex) return null
  const a = parseInt(hex[1], 16)
  const b = parseInt(hex[2], 16)
  return `${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`
}

/** True for any address that is not a public unicast address (unparseable input counts as blocked). */
export function isBlockedAddress(address: string): boolean {
  const ip = address.replace(/^\[|\]$/g, '').replace(/%.*$/, '')
  const version = isIP(ip)
  if (version === 4) return blocked.check(ip, 'ipv4')
  if (version === 6) {
    const v4 = mappedV4(ip)
    return v4 ? isBlockedAddress(v4) : blocked.check(ip, 'ipv6')
  }
  return true
}

export type Resolver = (host: string) => Promise<string[]>
const dnsResolve: Resolver = async (host) => (await lookup(host, { all: true, verbatim: true })).map((a) => a.address)

/** Parses and validates a URL: http(s) only, and every address the host resolves to must be public. */
export async function assertPublicHttpUrl(raw: string, resolve: Resolver = dnsResolve): Promise<URL> {
  const url = new URL(raw)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Only http(s) URLs are supported')
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  let addresses: string[]
  if (isIP(host)) addresses = [host]
  else if (host === 'localhost' || host.endsWith('.localhost') || !host.includes('.')) addresses = ['127.0.0.1']
  else addresses = await resolve(host)
  if (!addresses.length || addresses.some(isBlockedAddress)) throw new Error('Refusing to fetch a local or private network address')
  return url
}

/** Only these schemes may be handed to the OS via shell.openExternal (no file:, smb:, custom app schemes, …). */
export function isSafeExternalUrl(raw: string): boolean {
  try {
    return ['http:', 'https:', 'mailto:'].includes(new URL(raw).protocol)
  } catch {
    return false
  }
}

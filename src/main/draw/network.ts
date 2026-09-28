import { networkInterfaces, type NetworkInterfaceInfo } from 'node:os'
import type { DrawInterface } from '@shared/draw'

/** RFC 1918 private IPv4 ranges — the only addresses a draw session may bind to (never 0.0.0.0 / public). */
export function isPrivateIPv4(ip: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip)
  if (!m) return false
  const [a, b, c, d] = m.slice(1).map(Number)
  if ([a, b, c, d].some((n) => n > 255)) return false
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
}

const label = (name: string): string =>
  name === 'en0' ? 'Wi-Fi' : /^en\d+$/.test(name) ? 'Ethernet / USB' : /^bridge\d+$/.test(name) ? 'Bridge' : /^utun\d+$/.test(name) ? 'VPN' : name

/** Candidate LAN addresses, best first: en0 (Wi-Fi on most Macs), other en*, then anything else private. */
export function lanInterfaces(source: NodeJS.Dict<NetworkInterfaceInfo[]> = networkInterfaces()): DrawInterface[] {
  const found: DrawInterface[] = []
  for (const [name, infos] of Object.entries(source)) {
    for (const info of infos ?? []) {
      if (info.family !== 'IPv4' || info.internal || !isPrivateIPv4(info.address)) continue
      found.push({ name, address: info.address, label: label(name) })
    }
  }
  const rank = (i: DrawInterface): number => (i.name === 'en0' ? 0 : /^en\d+$/.test(i.name) ? 1 : /^utun\d+$/.test(i.name) ? 3 : 2)
  return found.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, undefined, { numeric: true }))
}

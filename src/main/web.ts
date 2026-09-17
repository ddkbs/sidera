import { net } from 'electron'
import type { LinkPreviewData } from '@shared/types'
import { extractContentHtml, htmlToMarkdown, parseLinkPreview } from '@shared/html'
import { assertPublicHttpUrl } from './netGuard'

const TIMEOUT_MS = 10_000
const MAX_BYTES = 3 * 1024 * 1024
const MAX_REDIRECTS = 5

type Fetched = { status: number; contentType: string; body: Buffer; truncated: boolean }

/** One HTTP request without following redirects (so every hop can be re-validated). */
function requestOnce(url: string, maxBytes: number, timeoutMs: number): Promise<Fetched | { redirect: string }> {
  return new Promise((resolve, reject) => {
    if (timeoutMs <= 0) return reject(new Error('Request timed out'))
    const req = net.request({ url, redirect: 'manual', useSessionCookies: false })
    let settled = false
    const finish = (fn: () => void): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn()
    }
    const timer = setTimeout(() => {
      finish(() => reject(new Error('Request timed out')))
      req.abort()
    }, timeoutMs)
    req.on('redirect', (_status, _method, redirectUrl) => {
      finish(() => resolve({ redirect: redirectUrl }))
      req.abort()
    })
    req.on('response', (res) => {
      const ct = res.headers['content-type']
      const contentType = (Array.isArray(ct) ? ct[0] : ct) ?? ''
      const chunks: Buffer[] = []
      let total = 0
      res.on('data', (chunk: Buffer) => {
        if (settled) return
        total += chunk.byteLength
        if (total > maxBytes) {
          finish(() => resolve({ status: res.statusCode, contentType, body: Buffer.concat(chunks), truncated: true }))
          req.abort()
          return
        }
        chunks.push(chunk)
      })
      res.on('end', () => finish(() => resolve({ status: res.statusCode, contentType, body: Buffer.concat(chunks), truncated: false })))
      res.on('error', (e: Error) => finish(() => reject(e)))
    })
    req.on('error', (e) => finish(() => reject(e)))
    req.end()
  })
}

/** GET with http(s)-only, public-address-only (checked on every redirect hop), a total timeout and a body size cap. */
async function guardedFetch(url: string, maxBytes: number): Promise<Fetched> {
  const deadline = Date.now() + TIMEOUT_MS
  let current = url
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const target = await assertPublicHttpUrl(current)
    const res = await requestOnce(target.toString(), maxBytes, deadline - Date.now())
    if (!('redirect' in res)) return res
    current = new URL(res.redirect, target).toString()
  }
  throw new Error('Too many redirects')
}

/** Fetch a page's HTML (truncated at MAX_BYTES). */
async function fetchHtml(url: string): Promise<string> {
  const res = await guardedFetch(url, MAX_BYTES)
  if (res.status < 200 || res.status >= 300) throw new Error(`Request failed: ${res.status}`)
  return res.body.toString('utf8')
}

export async function fetchLinkPreview(url: string): Promise<LinkPreviewData> {
  const html = await fetchHtml(url)
  const meta = parseLinkPreview(html, url)
  return { url, ...meta, fetchedAt: Date.now() }
}

/** Fetch a page and extract readable content as Markdown, for the web clipper. */
export async function fetchPageForClip(url: string): Promise<{ title: string; markdown: string }> {
  const html = await fetchHtml(url)
  const meta = parseLinkPreview(html, url)
  const markdown = htmlToMarkdown(extractContentHtml(html), url)
  return { title: meta.title ?? url, markdown }
}

const IMAGE_MAX_BYTES = 8 * 1024 * 1024
const IMAGE_EXT: Record<string, string> = {
  'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp', 'image/svg+xml': '.svg',
  'image/avif': '.avif', 'image/x-icon': '.ico', 'image/vnd.microsoft.icon': '.ico'
}

/** Download a remote image (http/https, public address, real image content-type, size-capped). Returns null on any failure. */
export async function downloadImage(url: string): Promise<{ bytes: Buffer; mime: string; ext: string } | null> {
  try {
    const res = await guardedFetch(url, IMAGE_MAX_BYTES)
    const mime = res.contentType.split(';')[0].trim().toLowerCase()
    if (res.status < 200 || res.status >= 300 || !IMAGE_EXT[mime] || res.truncated || !res.body.byteLength) return null
    return { bytes: res.body, mime, ext: IMAGE_EXT[mime] }
  } catch {
    return null
  }
}

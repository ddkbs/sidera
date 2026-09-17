import { net } from 'electron'
import type { LinkPreviewData } from '@shared/types'
import { extractContentHtml, htmlToMarkdown, parseLinkPreview } from '@shared/html'

const TIMEOUT_MS = 10_000
const MAX_BYTES = 3 * 1024 * 1024

/** Fetch a page's HTML, enforcing http(s)-only, a timeout and a body size cap. */
async function fetchHtml(url: string): Promise<string> {
  const parsed = new URL(url)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('Only http(s) URLs are supported')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await net.fetch(parsed.toString(), { signal: controller.signal, redirect: 'follow' })
    if (!res.ok) throw new Error(`Request failed: ${res.status} ${res.statusText}`)
    const reader = res.body?.getReader()
    if (!reader) return await res.text()
    const chunks: Uint8Array[] = []
    let total = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_BYTES) {
        void reader.cancel()
        break
      }
      chunks.push(value)
    }
    return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8')
  } finally {
    clearTimeout(timer)
  }
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

/** Download a remote image (http/https, real image content-type, size-capped). Returns null on any failure. */
export async function downloadImage(url: string): Promise<{ bytes: Buffer; mime: string; ext: string } | null> {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      const res = await net.fetch(parsed.toString(), { signal: controller.signal, redirect: 'follow' })
      const mime = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
      if (!res.ok || !IMAGE_EXT[mime]) return null
      const declared = Number(res.headers.get('content-length') ?? 0)
      if (declared > IMAGE_MAX_BYTES) return null
      const bytes = Buffer.from(await res.arrayBuffer())
      if (!bytes.byteLength || bytes.byteLength > IMAGE_MAX_BYTES) return null
      return { bytes, mime, ext: IMAGE_EXT[mime] }
    } finally {
      clearTimeout(timer)
    }
  } catch {
    return null
  }
}

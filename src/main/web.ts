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

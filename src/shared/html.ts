// Pure HTML string parsing helpers — no Electron, no DOM. Used by the link-preview fetcher and
// the web clipper (both in src/main/web.ts) and unit-tested directly in tests/web.test.ts.

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…'
}

/** Decode the small set of HTML entities that actually show up in titles/text. */
export function decodeEntities(s: string): string {
  return s
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, code: string) => {
      if (code[0] === '#') {
        const cp = code[1]?.toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
        return Number.isFinite(cp) ? String.fromCodePoint(cp) : m
      }
      return ENTITIES[code.toLowerCase()] ?? m
    })
}

/** Resolve a (possibly relative/protocol-relative) URL against a base; null if it can't be parsed. */
export function resolveUrl(base: string, href: string | null | undefined): string | undefined {
  if (!href) return undefined
  try {
    return new URL(href, base).toString()
  } catch {
    return undefined
  }
}

function metaContent(html: string, attr: 'property' | 'name', key: string): string | undefined {
  const re = new RegExp(`<meta\\b[^>]*\\b${attr}=["']${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>`, 'i')
  const tag = html.match(re)?.[0]
  if (!tag) return undefined
  const content = tag.match(/\bcontent=["']([^"']*)["']/i)?.[1]
  return content ? decodeEntities(content).trim() : undefined
}

function firstLinkHref(html: string, relPattern: RegExp): string | undefined {
  const re = /<link\b[^>]*>/gi
  for (const m of html.matchAll(re)) {
    const tag = m[0]
    const rel = tag.match(/\brel=["']([^"']*)["']/i)?.[1]
    if (rel && relPattern.test(rel)) {
      const href = tag.match(/\bhref=["']([^"']*)["']/i)?.[1]
      if (href) return href
    }
  }
  return undefined
}

export interface ParsedLinkMeta {
  title?: string
  description?: string
  image?: string
  siteName?: string
  favicon?: string
}

/** Extract og: / meta title, description, image, site name and favicon from a page's raw HTML. */
export function parseLinkPreview(html: string, url: string): ParsedLinkMeta {
  const titleTag = decodeEntities(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? '').trim()
  const title = metaContent(html, 'property', 'og:title') ?? (titleTag || undefined)
  const description = metaContent(html, 'property', 'og:description') ?? metaContent(html, 'name', 'description')
  const image = resolveUrl(url, metaContent(html, 'property', 'og:image'))
  const siteName = metaContent(html, 'property', 'og:site_name')
  const iconHref = firstLinkHref(html, /icon/i) ?? '/favicon.ico'
  const favicon = resolveUrl(url, iconHref)
  return { title, description, image, siteName, favicon }
}

/** Prefer <article>, else <main>, else <body>, else the whole document. */
export function extractContentHtml(html: string): string {
  const tag = (name: string): string | undefined => html.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'))?.[1]
  return tag('article') ?? tag('main') ?? tag('body') ?? html
}

const STRIP_TAGS = ['script', 'style', 'nav', 'header', 'footer', 'aside', 'form', 'noscript']

function stripInline(s: string): string {
  return s.replace(/<[^>]+>/g, '')
}

/**
 * Convert a readable HTML fragment (already narrowed to article/main/body) to Markdown:
 * headings, paragraphs, lists, blockquotes, code blocks and links. Deliberately simple
 * regex-based conversion — good enough for web-clipper content, not a general HTML parser.
 */
export function htmlToMarkdown(html: string, baseUrl: string, maxChars = 20000): string {
  let out = html.replace(/<!--[\s\S]*?-->/g, '')
  for (const t of STRIP_TAGS) out = out.replace(new RegExp(`<${t}\\b[^>]*>[\\s\\S]*?<\\/${t}>`, 'gi'), '')

  out = out.replace(/<img\b[^>]*>/gi, '') // alt text intentionally skipped
  out = out.replace(/<br\s*\/?>/gi, '\n')

  out = out.replace(/<a\b[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href, inner) => {
    const text = decodeEntities(stripInline(inner)).replace(/\s+/g, ' ').trim()
    const resolved = resolveUrl(baseUrl, href)
    return text ? `${text}${resolved ? ` (${resolved})` : ''}` : ''
  })

  out = out.replace(/<h([1-4])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, level, inner) => `\n\n${'#'.repeat(Number(level))} ${decodeEntities(stripInline(inner)).trim()}\n\n`)

  out = out.replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, (_m, inner) => `\n\n\`\`\`\n${decodeEntities(stripInline(inner)).trim()}\n\`\`\`\n\n`)

  out = out.replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi, (_m, inner) => {
    const text = decodeEntities(stripInline(inner)).trim()
    return `\n\n${text.split(/\n+/).map((l) => `> ${l.trim()}`).join('\n')}\n\n`
  })

  out = out.replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_m, inner) => `\n- ${decodeEntities(stripInline(inner)).replace(/\s+/g, ' ').trim()}`)
  out = out.replace(/<\/(ul|ol)>/gi, '\n\n')

  out = out.replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, (_m, inner) => `\n\n${decodeEntities(stripInline(inner)).replace(/\s+/g, ' ').trim()}\n\n`)

  out = stripInline(out)
  out = decodeEntities(out)
  out = out.replace(/[ \t]+/g, ' ').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  return out.length > maxChars ? out.slice(0, maxChars).trimEnd() + '…' : out
}

/** `Source: <url>` header used to prefix clipped cards. */
export function withSourceHeader(url: string, markdown: string): string {
  return `Source: ${url}\n\n---\n\n${markdown}`
}

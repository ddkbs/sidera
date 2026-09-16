import { describe, expect, it } from 'vitest'
import { decodeEntities, extractContentHtml, htmlToMarkdown, parseLinkPreview, resolveUrl, withSourceHeader } from '../src/shared/html'

describe('parseLinkPreview', () => {
  it('reads og: tags, falling back to <title>/description meta', () => {
    const html = `
      <html><head>
        <title>Fallback Title</title>
        <meta name="description" content="Fallback description">
        <meta property="og:title" content="Real Title &amp; More">
        <meta property="og:description" content="Real description">
        <meta property="og:image" content="/images/og.png">
        <meta property="og:site_name" content="Example Site">
        <link rel="shortcut icon" href="/favicon-32.png">
      </head><body></body></html>`
    const meta = parseLinkPreview(html, 'https://example.com/article')
    expect(meta.title).toBe('Real Title & More')
    expect(meta.description).toBe('Real description')
    expect(meta.image).toBe('https://example.com/images/og.png')
    expect(meta.siteName).toBe('Example Site')
    expect(meta.favicon).toBe('https://example.com/favicon-32.png')
  })

  it('falls back to <title> and default favicon when no og tags exist', () => {
    const html = `<html><head><title>Plain Page</title></head><body>hi</body></html>`
    const meta = parseLinkPreview(html, 'https://site.test/page')
    expect(meta.title).toBe('Plain Page')
    expect(meta.description).toBeUndefined()
    expect(meta.favicon).toBe('https://site.test/favicon.ico')
  })

  it('handles meta attributes in either order', () => {
    const html = `<meta content="Reordered" property="og:title">`
    expect(parseLinkPreview(html, 'https://x.test').title).toBe('Reordered')
  })
})

describe('extractContentHtml', () => {
  it('prefers <article>, then <main>, then <body>', () => {
    expect(extractContentHtml('<body><nav>nav</nav><article>ART</article></body>')).toBe('ART')
    expect(extractContentHtml('<body><main>MAIN</main></body>')).toBe('MAIN')
    expect(extractContentHtml('<body>BODY</body>')).toBe('BODY')
  })
})

describe('htmlToMarkdown', () => {
  it('converts headings, paragraphs, lists, blockquotes, code and links', () => {
    const html = `
      <h1>Title</h1>
      <p>Some <b>bold</b> text with a <a href="/relative">link</a>.</p>
      <ul><li>One</li><li>Two</li></ul>
      <blockquote>Quoted text</blockquote>
      <pre><code>const x = 1;</code></pre>
      <img src="/pic.png" alt="ignored">
    `
    const md = htmlToMarkdown(html, 'https://example.com/base/')
    expect(md).toContain('# Title')
    expect(md).toContain('Some bold text with a link (https://example.com/relative).')
    expect(md).toContain('- One')
    expect(md).toContain('- Two')
    expect(md).toContain('> Quoted text')
    expect(md).toContain('```\nconst x = 1;\n```')
    expect(md).not.toContain('ignored')
    expect(md).not.toContain('<')
  })

  it('strips script/style/nav/header/footer/aside/form blocks', () => {
    const html = `<nav>NAV</nav><script>evil()</script><style>.a{}</style><p>Keep me</p><footer>FOOTER</footer>`
    const md = htmlToMarkdown(html, 'https://example.com')
    expect(md).toContain('Keep me')
    expect(md).not.toContain('NAV')
    expect(md).not.toContain('evil()')
    expect(md).not.toContain('FOOTER')
  })

  it('caps output length', () => {
    const html = `<p>${'x'.repeat(30000)}</p>`
    const md = htmlToMarkdown(html, 'https://example.com', 100)
    expect(md.length).toBeLessThanOrEqual(101)
    expect(md.endsWith('…')).toBe(true)
  })
})

describe('resolveUrl / decodeEntities / withSourceHeader', () => {
  it('resolves relative URLs against a base', () => {
    expect(resolveUrl('https://a.test/dir/page', '../img.png')).toBe('https://a.test/img.png')
    expect(resolveUrl('https://a.test', undefined)).toBeUndefined()
  })

  it('decodes common entities', () => {
    expect(decodeEntities('Tom &amp; Jerry &mdash; &#39;fun&#39;')).toBe("Tom & Jerry — 'fun'")
  })

  it('formats the clipped-card source header', () => {
    expect(withSourceHeader('https://example.com', 'Body text')).toBe('Source: https://example.com\n\n---\n\nBody text')
  })
})

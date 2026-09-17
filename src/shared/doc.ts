import type { DocJSON } from './types'

export const MENTION_NODE = 'cardMention'

export const emptyDoc = (): DocJSON => ({ type: 'doc', content: [] })

const BLOCKS = new Set(['paragraph', 'heading', 'codeBlock', 'horizontalRule', 'detailsSummary', 'tableRow'])
const CELLS = new Set(['tableCell', 'tableHeader'])

/** Plain text used for FTS indexing and excerpts. */
export function docToText(doc: DocJSON | null | undefined): string {
  if (!doc) return ''
  const out: string[] = []
  const walk = (n: DocJSON, inCell = false): void => {
    if (n.type === 'text') out.push(n.text ?? '')
    else if (n.type === MENTION_NODE) out.push(String(n.attrs?.label ?? ''))
    else if (n.type === 'hardBreak') out.push('\n')
    n.content?.forEach((c) => walk(c, inCell || CELLS.has(n.type)))
    if (CELLS.has(n.type)) out.push(' ')
    else if (!inCell && BLOCKS.has(n.type)) out.push('\n')
  }
  walk(doc)
  return out.join('').replace(/\n{3,}/g, '\n\n').trim()
}

/** Card ids referenced by mention nodes (for backlinks). */
export function extractMentions(doc: DocJSON | null | undefined): string[] {
  const ids = new Set<string>()
  const walk = (n: DocJSON): void => {
    if (n.type === MENTION_NODE && typeof n.attrs?.id === 'string') ids.add(n.attrs.id)
    n.content?.forEach(walk)
  }
  if (doc) walk(doc)
  return [...ids]
}

/** Add a mark to every text node of `nodes`, innermost-first (matches Tiptap's mark order). */
const withMark = (nodes: DocJSON[], mark: DocJSON): DocJSON[] =>
  nodes.map((n) => (n.type === 'text' ? { ...n, marks: [...(n.marks ?? []), mark] } : n))

/**
 * Inline Markdown → text nodes. Colour, highlight and underline use HTML-ish tags
 * (`<span style="color:…">`, `<mark style="background-color:…">`, `<u>`) so they survive
 * a Markdown round-trip; their bodies are parsed recursively so marks can nest.
 */
function inline(text: string): DocJSON[] {
  if (!text) return []
  const nodes: DocJSON[] = []
  const re =
    /(<span style="color:([^"]*)">([\s\S]*?)<\/span>|<mark(?: style="background-color:([^"]*)")?>([\s\S]*?)<\/mark>|<u>([\s\S]*?)<\/u>|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[\[[^\]]+\]\])/g
  let last = 0
  for (const m of text.matchAll(re)) {
    if (m.index! > last) nodes.push({ type: 'text', text: text.slice(last, m.index) })
    const t = m[0]
    if (m[2] !== undefined) nodes.push(...withMark(inline(m[3]), { type: 'textStyle', attrs: { color: m[2] } }))
    else if (m[5] !== undefined) nodes.push(...withMark(inline(m[5]), { type: 'highlight', attrs: { color: m[4] ?? null } }))
    else if (m[6] !== undefined) nodes.push(...withMark(inline(m[6]), { type: 'underline' }))
    else if (t.startsWith('**')) nodes.push({ type: 'text', text: t.slice(2, -2), marks: [{ type: 'bold' }] })
    else if (t.startsWith('`')) nodes.push({ type: 'text', text: t.slice(1, -1), marks: [{ type: 'code' }] })
    else if (t.startsWith('[[')) nodes.push({ type: 'text', text: t })
    else nodes.push({ type: 'text', text: t.slice(1, -1), marks: [{ type: 'italic' }] })
    last = m.index! + t.length
  }
  if (last < text.length) nodes.push({ type: 'text', text: text.slice(last) })
  return nodes
}

const para = (text: string): DocJSON => {
  const content = inline(text)
  return content.length ? { type: 'paragraph', content } : { type: 'paragraph' }
}

const cellTexts = (line: string): string[] =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, '|'))

const tableCell = (text: string, type: 'tableCell' | 'tableHeader'): DocJSON => ({
  type,
  attrs: { colspan: 1, rowspan: 1, colwidth: null },
  content: [para(text)]
})

/** Minimal Markdown → Tiptap JSON (headings, lists, tasks, quotes, code, hr, tables, toggles). Used by MCP. */
export function markdownToDoc(md: string): DocJSON {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const content: DocJSON[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) { i++; continue }
    const fence = line.match(/^```(\w*)/)
    if (fence) {
      const body: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) body.push(lines[i++])
      i++
      content.push({ type: 'codeBlock', attrs: { language: fence[1] || null }, content: body.length ? [{ type: 'text', text: body.join('\n') }] : undefined })
      continue
    }
    const det = line.match(/^<details(\s+open)?>\s*$/)
    if (det) {
      i++
      let summary = ''
      if (/^<summary>/.test(lines[i] ?? '')) summary = lines[i++].replace(/^<summary>/, '').replace(/<\/summary>\s*$/, '')
      const body: string[] = []
      let depth = 1
      while (i < lines.length) {
        if (/^<details(\s+open)?>\s*$/.test(lines[i])) depth++
        else if (/^<\/details>\s*$/.test(lines[i])) {
          depth--
          if (!depth) {
            i++
            break
          }
        }
        body.push(lines[i++])
      }
      content.push({
        type: 'details',
        attrs: { open: Boolean(det[1]) },
        content: [
          { type: 'detailsSummary', content: inline(summary) },
          { type: 'detailsContent', content: markdownToDoc(body.join('\n')).content }
        ]
      })
      continue
    }
    if (/^\s*\|/.test(line) && /^\s*\|[\s|:-]+\|\s*$/.test(lines[i + 1] ?? '')) {
      const header = cellTexts(lines[i])
      i += 2
      const rows: DocJSON[] = []
      if (header.some((c) => c !== '')) rows.push({ type: 'tableRow', content: header.map((c) => tableCell(c, 'tableHeader')) })
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push({ type: 'tableRow', content: cellTexts(lines[i++]).map((c) => tableCell(c, 'tableCell')) })
      content.push({ type: 'table', content: rows })
      continue
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/)
    if (h) { content.push({ type: 'heading', attrs: { level: Math.min(h[1].length, 4) }, content: inline(h[2]) }); i++; continue }
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) { content.push({ type: 'horizontalRule' }); i++; continue }
    if (line.startsWith('>')) {
      const body: DocJSON[] = []
      while (i < lines.length && lines[i].startsWith('>')) body.push(para(lines[i++].replace(/^>\s?/, '')))
      content.push({ type: 'blockquote', content: body })
      continue
    }
    if (/^\s*[-*]\s+\[[ xX]\]\s/.test(line)) {
      const items: DocJSON[] = []
      while (i < lines.length && /^\s*[-*]\s+\[[ xX]\]\s/.test(lines[i])) {
        const m = lines[i++].match(/^\s*[-*]\s+\[([ xX])\]\s(.*)$/)!
        items.push({ type: 'taskItem', attrs: { checked: m[1] !== ' ' }, content: [para(m[2])] })
      }
      content.push({ type: 'taskList', content: items })
      continue
    }
    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line)
      const re = ordered ? /^\s*\d+\.\s+/ : /^\s*[-*]\s+/
      const items: DocJSON[] = []
      while (i < lines.length && re.test(lines[i])) items.push({ type: 'listItem', content: [para(lines[i++].replace(re, ''))] })
      content.push({ type: ordered ? 'orderedList' : 'bulletList', content: items })
      continue
    }
    const body: string[] = []
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|>|\s*[-*]\s|\s*\d+\.\s|\s*\||<details|<\/details|<summary)/.test(lines[i])) body.push(lines[i++])
    content.push(para(body.join(' ')))
  }
  return { type: 'doc', content }
}

/** Tiptap JSON → Markdown, used for MCP read tools. */
export function docToMarkdown(doc: DocJSON | null | undefined): string {
  if (!doc) return ''
  const inl = (nodes: DocJSON[] = []): string =>
    nodes
      .map((n) => {
        if (n.type === MENTION_NODE) return `[[${n.attrs?.label ?? ''}]]`
        if (n.type === 'hardBreak') return '\n'
        let t = n.text ?? ''
        for (const m of n.marks ?? []) {
          if (m.type === 'bold') t = `**${t}**`
          else if (m.type === 'italic') t = `*${t}*`
          else if (m.type === 'code') t = `\`${t}\``
          else if (m.type === 'link') t = `[${t}](${m.attrs?.href ?? ''})`
          else if (m.type === 'underline') t = `<u>${t}</u>`
          else if (m.type === 'textStyle' && m.attrs?.color) t = `<span style="color:${m.attrs.color}">${t}</span>`
          else if (m.type === 'highlight') t = m.attrs?.color ? `<mark style="background-color:${m.attrs.color}">${t}</mark>` : `<mark>${t}</mark>`
        }
        return t
      })
      .join('')
  const block = (n: DocJSON, indent = ''): string => {
    switch (n.type) {
      case 'paragraph': return indent + inl(n.content)
      case 'heading': return '#'.repeat(Number(n.attrs?.level ?? 1)) + ' ' + inl(n.content)
      case 'bulletList': return (n.content ?? []).map((li) => `${indent}- ${(li.content ?? []).map((c) => block(c)).join('\n')}`).join('\n')
      case 'orderedList': return (n.content ?? []).map((li, k) => `${indent}${k + 1}. ${(li.content ?? []).map((c) => block(c)).join('\n')}`).join('\n')
      case 'taskList': return (n.content ?? []).map((li) => `${indent}- [${li.attrs?.checked ? 'x' : ' '}] ${(li.content ?? []).map((c) => block(c)).join('\n')}`).join('\n')
      case 'blockquote': return (n.content ?? []).map((c) => '> ' + block(c)).join('\n')
      case 'codeBlock': return '```' + (n.attrs?.language ?? '') + '\n' + inl(n.content) + '\n```'
      case 'horizontalRule': return '---'
      case 'table': {
        const rows = n.content ?? []
        const width = Math.max(1, ...rows.map((r) => (r.content ?? []).length))
        const cells = (r: DocJSON): string[] => {
          const xs = (r.content ?? []).map((c) => (c.content ?? []).map((b) => block(b)).join(' ').replace(/\|/g, '\\|').trim())
          while (xs.length < width) xs.push('')
          return xs
        }
        const row = (xs: string[]): string => '|' + xs.map((c) => ` ${c} `).join('|') + '|'
        const headed = rows.length > 0 && (rows[0].content ?? []).every((c) => c.type === 'tableHeader')
        const body = (headed ? rows.slice(1) : rows).map((r) => row(cells(r)))
        // GFM needs a header row: emit an empty one when the table has no header cells.
        return [row(headed ? cells(rows[0]) : Array(width).fill('')), row(Array(width).fill('---')), ...body].join('\n')
      }
      case 'details': {
        const parts = n.content ?? []
        const summary = parts.find((c) => c.type === 'detailsSummary')
        const inner = (parts.find((c) => c.type === 'detailsContent')?.content ?? []).map((c) => block(c)).join('\n\n')
        return `<details${n.attrs?.open ? ' open' : ''}>\n<summary>${inl(summary?.content)}</summary>\n\n${inner}\n\n</details>`
      }
      default: return inl(n.content)
    }
  }
  return (doc.content ?? []).map((n) => block(n)).join('\n\n')
}

/** Replace `[[Title]]` in text nodes with card mention nodes when `resolve(title)` finds a card id. */
export function linkWikiRefs(doc: DocJSON, resolve: (title: string) => string | null): DocJSON {
  const walk = (n: DocJSON): DocJSON => {
    if (!n.content) return n
    const content: DocJSON[] = []
    for (const child of n.content) {
      if (child.type !== 'text' || !child.text?.includes('[[')) {
        content.push(walk(child))
        continue
      }
      let last = 0
      for (const m of child.text.matchAll(/\[\[([^\]]+)\]\]/g)) {
        const id = resolve(m[1].trim())
        if (!id) continue
        if (m.index! > last) content.push({ ...child, text: child.text.slice(last, m.index) })
        content.push({ type: MENTION_NODE, attrs: { id, label: m[1].trim() } })
        last = m.index! + m[0].length
      }
      if (last < child.text.length) content.push({ ...child, text: child.text.slice(last) })
    }
    return { ...n, content }
  }
  return walk(doc)
}

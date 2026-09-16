import type { DocJSON } from './types'

export const MENTION_NODE = 'cardMention'

export const emptyDoc = (): DocJSON => ({ type: 'doc', content: [] })

const BLOCKS = new Set(['paragraph', 'heading', 'codeBlock', 'horizontalRule'])

/** Plain text used for FTS indexing and excerpts. */
export function docToText(doc: DocJSON | null | undefined): string {
  if (!doc) return ''
  const out: string[] = []
  const walk = (n: DocJSON): void => {
    if (n.type === 'text') out.push(n.text ?? '')
    else if (n.type === MENTION_NODE) out.push(String(n.attrs?.label ?? ''))
    else if (n.type === 'hardBreak') out.push('\n')
    n.content?.forEach(walk)
    if (BLOCKS.has(n.type)) out.push('\n')
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

function inline(text: string): DocJSON[] {
  if (!text) return []
  const nodes: DocJSON[] = []
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[\[[^\]]+\]\])/g
  let last = 0
  for (const m of text.matchAll(re)) {
    if (m.index! > last) nodes.push({ type: 'text', text: text.slice(last, m.index) })
    const t = m[0]
    if (t.startsWith('**')) nodes.push({ type: 'text', text: t.slice(2, -2), marks: [{ type: 'bold' }] })
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

/** Minimal Markdown → Tiptap JSON (headings, lists, tasks, quotes, code, hr). Used by MCP. */
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
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|>|\s*[-*]\s|\s*\d+\.\s)/.test(lines[i])) body.push(lines[i++])
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

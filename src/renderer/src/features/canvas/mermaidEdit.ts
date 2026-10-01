import { t } from '../../lib/i18n'
// Pure helpers to edit Mermaid flowchart source from the rendered diagram.

const OPEN = ['(((', '((', '([', '[[', '[(', '[/', '[\\', '{{', '[', '(', '{', '>']
const CLOSE: Record<string, string[]> = {
  '(((': [')))'], '((': ['))'], '([': ['])'], '[[': [']]'], '[(': [')]'], '[/': ['/]', '\\]'], '[\\': ['\\]', '/]'],
  '{{': ['}}'], '[': [']'], '(': [')'], '{': ['}'], '>': [']']
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')

/** Flowchart node id from a rendered SVG group id like "m1a-0-flowchart-A-12". */
export function nodeIdFromSvg(groupId: string): string | null {
  const m = groupId.match(/flowchart-(.+)-\d+$/)
  return m ? m[1] : null
}

export const isFlowchart = (source: string) => /^\s*(graph|flowchart)\b/m.test(source)

const quote = (label: string) => (/[[\](){}"<>|]/.test(label) ? `"${label.replace(/"/g, '#quot;')}"` : label)

/** Current label text of a node (first shaped definition), or null. */
export function getNodeLabel(source: string, id: string): string | null {
  const def = findDefinition(source, id)
  if (!def) return null
  const raw = source.slice(def.labelStart, def.labelEnd).trim()
  return raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1).replace(/#quot;/g, '"') : raw
}

function findDefinition(source: string, id: string): { labelStart: number; labelEnd: number } | null {
  const re = new RegExp(`(^|[\\s;&>|-])${esc(id)}(?=[\\[({>])`, 'gm')
  for (const m of source.matchAll(re)) {
    const openAt = m.index! + m[1].length + id.length
    const open = OPEN.find((o) => source.startsWith(o, openAt))
    if (!open) continue
    const labelStart = openAt + open.length
    let best = -1
    for (const close of CLOSE[open]) {
      const i = source.indexOf(close, labelStart)
      if (i >= 0 && (best < 0 || i < best)) best = i
    }
    if (best >= 0 && !source.slice(labelStart, best).includes('\n')) return { labelStart, labelEnd: best }
  }
  return null
}

/** Rename a node's label, keeping its shape. Bare nodes ("A --> B") get a rectangle. */
export function renameNode(source: string, id: string, label: string): string {
  const def = findDefinition(source, id)
  if (def) return source.slice(0, def.labelStart) + quote(label) + source.slice(def.labelEnd)
  const re = new RegExp(`(^|[\\s;&>|-])${esc(id)}(?=\\s|$|;|-|&)`, 'm')
  return source.replace(re, (_m, pre: string) => `${pre}${id}[${quote(label)}]`)
}

/** Append a new node connected from `fromId`; returns the new source and id. */
export function addConnectedNode(source: string, fromId: string, label = t('flow.newStep')): { source: string; id: string } {
  let n = 1
  while (new RegExp(`(^|[^\\w])N${n}([^\\w]|$)`).test(source)) n++
  const id = `N${n}`
  const indent = source.match(/\n(\s+)\S/)?.[1] ?? '  '
  return { source: `${source.replace(/\s*$/, '')}\n${indent}${fromId} --> ${id}[${quote(label)}]`, id }
}

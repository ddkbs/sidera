import { nanoid } from 'nanoid'
import type { DocJSON } from './types'

export interface TaskItem {
  /** stable id (taskItem attrs.id), survives reordering/insertion */
  taskId: string
  /** position among taskItem nodes in the doc, depth-first pre-order */
  index: number
  text: string
  checked: boolean
}

const inlineText = (n: DocJSON): string => {
  if (n.type === 'text') return n.text ?? ''
  if (n.type === 'cardMention') return String(n.attrs?.label ?? '')
  if (n.type === 'hardBreak') return '\n'
  return (n.content ?? []).map(inlineText).join('')
}

/** Text of a taskItem's own content, excluding any nested task sub-lists. */
const taskItemText = (item: DocJSON): string =>
  (item.content ?? [])
    .filter((c) => c.type !== 'taskList')
    .map(inlineText)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()

/** All taskItem nodes in a doc, depth-first pre-order (parent before children). */
export function collectTasks(doc: DocJSON | null | undefined): TaskItem[] {
  const out: TaskItem[] = []
  const walk = (n: DocJSON): void => {
    if (n.type === 'taskItem')
      out.push({ taskId: String(n.attrs?.id ?? ''), index: out.length, text: taskItemText(n), checked: !!n.attrs?.checked })
    n.content?.forEach(walk)
  }
  if (doc) walk(doc)
  return out
}

/** Returns a new doc with a stable `id` filled in on every taskItem missing one. Idempotent. */
export function ensureTaskIds(doc: DocJSON): DocJSON {
  const walk = (n: DocJSON): DocJSON => {
    const withId = n.type === 'taskItem' && !n.attrs?.id ? { ...n, attrs: { ...n.attrs, id: nanoid(10) } } : n
    return withId.content ? { ...withId, content: withId.content.map(walk) } : withId
  }
  return walk(doc)
}

/** Returns a new doc with the checked state of the taskItem at `index` (depth-first pre-order) set. */
export function setTaskChecked(doc: DocJSON, index: number, checked: boolean): DocJSON {
  let i = 0
  const walk = (n: DocJSON): DocJSON => {
    if (n.type === 'taskItem') {
      const mine = i++
      const next = mine === index ? { ...n, attrs: { ...n.attrs, checked } } : n
      return next.content ? { ...next, content: next.content.map(walk) } : next
    }
    return n.content ? { ...n, content: n.content.map(walk) } : n
  }
  return walk(doc)
}

/** Returns a new doc with an unchecked task appended: extends a trailing to-do list, otherwise starts a new one. */
export function appendTask(doc: DocJSON, text: string): { doc: DocJSON; index: number } {
  const item: DocJSON = {
    type: 'taskItem',
    attrs: { checked: false, id: nanoid(10) },
    content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : undefined }]
  }
  const blocks = doc.content ?? []
  const last = blocks[blocks.length - 1]
  const content =
    last?.type === 'taskList'
      ? [...blocks.slice(0, -1), { ...last, content: [...(last.content ?? []), item] }]
      : [...blocks.filter((b, i) => !(i === blocks.length - 1 && b.type === 'paragraph' && !b.content?.length)), { type: 'taskList', content: [item] }]
  const next = { ...doc, content }
  return { doc: next, index: collectTasks(next).length - 1 }
}

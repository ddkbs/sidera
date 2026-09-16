import { docToMarkdown } from '@shared/doc'
import type { Services } from './index'

export interface MdFile {
  name: string
  content: string
}

const safe = (s: string) => s.replace(/[/\\?%*:|"<>\n\r]/g, '-').trim().slice(0, 120) || 'Untitled'

/** Every card as a Markdown file with YAML front matter (id, tags). Journal days go to `journal/`. */
export function exportCards(api: Services): MdFile[] {
  const files: MdFile[] = []
  const used = new Set<string>()
  const unique = (base: string) => {
    let name = base
    for (let i = 2; used.has(name.toLowerCase()); i++) name = base.replace(/\.md$/, ` ${i}.md`)
    used.add(name.toLowerCase())
    return name
  }
  for (const s of api.listCards({ limit: 1_000_000 })) {
    const card = api.getCard(s.id)
    if (!card) continue
    const front = ['---', `id: ${card.id}`, `title: ${JSON.stringify(card.title)}`]
    if (card.tags.length) front.push(`tags: [${card.tags.map((t) => JSON.stringify(t.name)).join(', ')}]`)
    front.push(`updated: ${new Date(card.updatedAt).toISOString()}`, '---', '')
    files.push({ name: unique(`${safe(card.title)}.md`), content: front.join('\n') + docToMarkdown(card.content) + '\n' })
  }
  for (const day of api.listJournal(100_000)) {
    if (!day.card.contentText.trim()) continue
    files.push({ name: `journal/${day.date}.md`, content: docToMarkdown(day.card.content) + '\n' })
  }
  return files
}

/** Create cards from Markdown files. Title = front matter title, first `# heading`, or file name. */
export function importCards(api: Services, files: MdFile[]): number {
  let count = 0
  for (const f of files) {
    let body = f.content.replace(/\r\n/g, '\n')
    let title = f.name.replace(/\.(md|markdown|txt)$/i, '')
    let tags: string[] = []
    const fm = body.match(/^---\n([\s\S]*?)\n---\n?/)
    if (fm) {
      body = body.slice(fm[0].length)
      const t = fm[1].match(/^title:\s*(.+)$/m)
      if (t) title = t[1].trim().replace(/^"|"$/g, '')
      const tg = fm[1].match(/^tags:\s*\[(.*)\]$/m)
      if (tg) tags = tg[1].split(',').map((x) => x.trim().replace(/^"|"$/g, '')).filter(Boolean)
    } else {
      const h = body.match(/^#\s+(.+)\n?/)
      if (h) {
        title = h[1].trim()
        body = body.slice(h[0].length)
      }
    }
    const tagIds = tags.map((name) => api.createTag({ name }).id)
    api.createCard({ title, markdown: body.trim(), tagIds })
    count++
  }
  return count
}

import { describe, expect, it } from 'vitest'
import { docToMarkdown, docToText, markdownToDoc } from '@shared/doc'

describe('markdown <-> doc', () => {
  it('round-trips common blocks', () => {
    const md = '# Title\n\nHello **bold** and *it*\n\n- a\n- b\n\n- [x] done\n- [ ] todo\n\n> quote\n\n```ts\nconst x = 1\n```'
    const doc = markdownToDoc(md)
    expect(docToMarkdown(doc)).toBe(md)
    expect(docToText(doc)).toContain('Hello bold and it')
  })
})

import { describe, expect, it } from 'vitest'
import { docToMarkdown, docToText, markdownToDoc } from '@shared/doc'

/** Markdown → doc → Markdown must be the identity for everything the editor can produce. */
const roundTrip = (md: string): void => expect(docToMarkdown(markdownToDoc(md))).toBe(md)

describe('markdown <-> doc', () => {
  it('round-trips common blocks', () => {
    const md = '# Title\n\nHello **bold** and *it*\n\n- a\n- b\n\n- [x] done\n- [ ] todo\n\n> quote\n\n```ts\nconst x = 1\n```'
    const doc = markdownToDoc(md)
    expect(docToMarkdown(doc)).toBe(md)
    expect(docToText(doc)).toContain('Hello bold and it')
  })

  it('round-trips task items with mixed state', () => {
    roundTrip('- [ ] write\n- [x] ship')
    const doc = markdownToDoc('- [x] ship')
    expect(doc.content?.[0].content?.[0].attrs?.checked).toBe(true)
  })

  it('round-trips text colour', () => {
    const md = 'Make it <span style="color:oklch(0.62 0.13 90)">yellow</span> please'
    roundTrip(md)
    const marks = markdownToDoc(md).content?.[0].content?.[1].marks
    expect(marks).toEqual([{ type: 'textStyle', attrs: { color: 'oklch(0.62 0.13 90)' } }])
  })

  it('round-trips highlight, with and without a colour', () => {
    roundTrip('a <mark style="background-color:oklch(0.65 0.2 25 / 0.1)">red bg</mark> b')
    roundTrip('a <mark>plain</mark> b')
    expect(markdownToDoc('<mark>x</mark>').content?.[0].content?.[0].marks?.[0]).toEqual({ type: 'highlight', attrs: { color: null } })
  })

  it('round-trips underline and nested marks', () => {
    roundTrip('<u>under</u>')
    const md = '<span style="color:red"><mark style="background-color:yellow">**both**</mark></span>'
    roundTrip(md)
    const node = markdownToDoc(md).content?.[0].content?.[0]
    expect(node?.text).toBe('both')
    expect(node?.marks?.map((m) => m.type)).toEqual(['bold', 'highlight', 'textStyle'])
  })

  it('round-trips a table with a header row', () => {
    const md = '| Name | Role |\n| --- | --- |\n| Ada | Maths |\n| Alan | Logic |'
    roundTrip(md)
    const table = markdownToDoc(md).content?.[0]
    expect(table?.type).toBe('table')
    expect(table?.content?.[0].content?.[0].type).toBe('tableHeader')
    expect(table?.content?.[1].content?.[1].type).toBe('tableCell')
    expect(docToText(markdownToDoc(md))).toContain('Ada Maths')
  })

  it('round-trips a headerless table and escaped pipes', () => {
    roundTrip('|  |  |\n| --- | --- |\n| a | b |')
    roundTrip('| a \\| b |\n| --- |\n| c |')
  })

  it('round-trips a toggle list, open and closed', () => {
    const open = '<details open>\n<summary>More</summary>\n\nHidden **body**\n\n- one\n\n</details>'
    roundTrip(open)
    const closed = '<details>\n<summary>More</summary>\n\nHidden\n\n</details>'
    roundTrip(closed)
    const doc = markdownToDoc(open)
    expect(doc.content?.[0].attrs?.open).toBe(true)
    expect(markdownToDoc(closed).content?.[0].attrs?.open).toBe(false)
    expect(doc.content?.[0].content?.[0].type).toBe('detailsSummary')
    expect(docToText(doc)).toContain('More')
    expect(docToText(doc)).toContain('Hidden body')
  })

  it('round-trips nested toggles', () => {
    roundTrip('<details open>\n<summary>Outer</summary>\n\n<details>\n<summary>Inner</summary>\n\nDeep\n\n</details>\n\n</details>')
  })

  it('round-trips a toggle containing a table', () => {
    roundTrip('<details open>\n<summary>Data</summary>\n\n| a |\n| --- |\n| b |\n\n</details>')
  })

  it('keeps list markers in plain text', () => {
    expect(docToText(markdownToDoc('1. eins\n2. zwei\n\n- a'))).toBe('1. eins\n2. zwei\n• a')
  })
})

import { beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../src/main/db/client'
import { layoutGroups, type SectionLayout } from '../src/main/services/organize'
import { createServices, type Services } from '../src/main/services'

function rectsOverlap(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

function objectsFit(sections: SectionLayout[]): void {
  for (const sec of sections) {
    for (const o of sec.objects) {
      // sized objects carry no width/height on their own after layout, so re-derive bounds from the group input is
      // unnecessary here — we only assert the position is within the section rectangle (upper-left inclusive).
      expect(o.x).toBeGreaterThanOrEqual(sec.x)
      expect(o.y).toBeGreaterThanOrEqual(sec.y)
      expect(o.x).toBeLessThan(sec.x + sec.width)
      expect(o.y).toBeLessThan(sec.y + sec.height)
    }
  }
}

describe('layoutGroups (pure)', () => {
  it('places sections in a grid with no overlaps and objects inside bounds', () => {
    const groups = [
      { title: 'A', color: 'blue', objects: [{ id: 'a1', width: 320, height: 220 }, { id: 'a2', width: 320, height: 220 }] },
      { title: 'B', color: 'green', objects: [{ id: 'b1', width: 240, height: 60 }] },
      { title: 'C', color: 'red', objects: [{ id: 'c1', width: 320, height: 220 }, { id: 'c2', width: 320, height: 220 }, { id: 'c3', width: 320, height: 220 }] },
      { title: 'D', color: 'purple', objects: [{ id: 'd1', width: 200, height: 200 }] },
      { title: 'E', color: 'teal', objects: [{ id: 'e1', width: 200, height: 200 }] }
    ]
    const unsorted = [{ id: 'u1', width: 320, height: 220 }, { id: 'u2', width: 240, height: 60 }]
    const { sections, unsorted: unsortedPos } = layoutGroups(groups, unsorted)

    expect(sections).toHaveLength(5)
    objectsFit(sections)

    for (let i = 0; i < sections.length; i++)
      for (let j = i + 1; j < sections.length; j++) expect(rectsOverlap(sections[i], sections[j])).toBe(false)

    // objects within the same section never overlap each other
    for (const sec of sections) {
      const withSize = sec.objects.map((o, idx) => ({ ...o, width: groups.find((g) => g.title === sec.title)!.objects[idx].width, height: groups.find((g) => g.title === sec.title)!.objects[idx].height }))
      for (let i = 0; i < withSize.length; i++)
        for (let j = i + 1; j < withSize.length; j++) expect(rectsOverlap(withSize[i], withSize[j])).toBe(false)
    }

    expect(unsortedPos.map((o) => o.id)).toEqual(['u1', 'u2'])
    // unsorted area sits below every section
    const maxSectionBottom = Math.max(...sections.map((s) => s.y + s.height))
    for (const o of unsortedPos) expect(o.y).toBeGreaterThanOrEqual(maxSectionBottom)
  })

  it('handles no groups (everything unsorted)', () => {
    const { sections, unsorted } = layoutGroups([], [{ id: 'x', width: 100, height: 100 }])
    expect(sections).toHaveLength(0)
    expect(unsorted).toHaveLength(1)
  })

  it('handles empty groups (no objects) without throwing', () => {
    const { sections } = layoutGroups([{ title: 'Empty', color: 'gray', objects: [] }], [])
    expect(sections).toHaveLength(1)
    expect(sections[0].objects).toHaveLength(0)
  })
})

describe('organizeBoard service', () => {
  let api: Services
  beforeEach(() => {
    api = createServices(openDatabase(':memory:'))
  })

  it('groups objects into sections, auto-colors missing colors, and leaves the rest unsorted', () => {
    const wb = api.createWhiteboard({ name: 'Board' })
    const cards = Array.from({ length: 5 }, (_, i) => api.createCard({ title: `Card ${i}` }))
    const objects = cards.map((c, i) => api.addObject({ whiteboardId: wb.id, kind: 'card', refId: c.id, x: i * 400, y: 0 }))

    const result = api.organizeBoard({
      whiteboardId: wb.id,
      groups: [
        { title: 'Group A', objectIds: [objects[0].id, objects[1].id] },
        { title: 'Group B', color: 'pink', objectIds: [objects[2].id] }
      ]
    })

    expect(result.sections).toHaveLength(2)
    expect(result.sections.map((s) => s.title)).toEqual(['Group A', 'Group B'])
    expect(result.sections[0].objectCount).toBe(2)
    expect(result.unsorted).toBe(2)

    const detail = api.getWhiteboard(wb.id)!
    const sections = detail.objects.filter((o) => o.kind === 'section')
    expect(sections).toHaveLength(2)
    expect(sections.find((s) => s.data.title === 'Group B')!.color).toBe('pink')
    expect(sections.find((s) => s.data.title === 'Group A')!.color).toBeTruthy()

    // the grouped objects moved inside their section's bounds
    const groupASection = sections.find((s) => s.data.title === 'Group A')!
    for (const o of objects.slice(0, 2)) {
      const obj = detail.objects.find((x) => x.id === o.id)!
      expect(obj.x).toBeGreaterThanOrEqual(groupASection.x)
      expect(obj.y).toBeGreaterThanOrEqual(groupASection.y)
    }
  })

  it('removes existing sections by default before re-organizing', () => {
    const wb = api.createWhiteboard({ name: 'Board' })
    api.addObject({ whiteboardId: wb.id, kind: 'section', x: 0, y: 0, data: { title: 'Old' }, color: 'gray' })
    const card = api.createCard({ title: 'Card' })
    const obj = api.addObject({ whiteboardId: wb.id, kind: 'card', refId: card.id, x: 0, y: 0 })

    api.organizeBoard({ whiteboardId: wb.id, groups: [{ title: 'New', objectIds: [obj.id] }] })

    const detail = api.getWhiteboard(wb.id)!
    const sections = detail.objects.filter((o) => o.kind === 'section')
    expect(sections).toHaveLength(1)
    expect(sections[0].data.title).toBe('New')
  })

  it('keeps existing sections when removeExistingSections is false', () => {
    const wb = api.createWhiteboard({ name: 'Board' })
    api.addObject({ whiteboardId: wb.id, kind: 'section', x: 0, y: 0, data: { title: 'Old' }, color: 'gray' })
    const card = api.createCard({ title: 'Card' })
    const obj = api.addObject({ whiteboardId: wb.id, kind: 'card', refId: card.id, x: 0, y: 0 })

    api.organizeBoard({ whiteboardId: wb.id, groups: [{ title: 'New', objectIds: [obj.id] }], removeExistingSections: false })

    const detail = api.getWhiteboard(wb.id)!
    const sections = detail.objects.filter((o) => o.kind === 'section')
    expect(sections.map((s) => s.data.title).sort()).toEqual(['New', 'Old'])
  })

  it('leaves connections untouched', () => {
    const wb = api.createWhiteboard({ name: 'Board' })
    const c1 = api.createCard({ title: 'One' })
    const c2 = api.createCard({ title: 'Two' })
    const o1 = api.addObject({ whiteboardId: wb.id, kind: 'card', refId: c1.id, x: 0, y: 0 })
    const o2 = api.addObject({ whiteboardId: wb.id, kind: 'card', refId: c2.id, x: 400, y: 0 })
    const conn = api.addConnection({ whiteboardId: wb.id, sourceId: o1.id, targetId: o2.id, label: 'link' })

    api.organizeBoard({ whiteboardId: wb.id, groups: [{ title: 'G', objectIds: [o1.id, o2.id] }] })

    const detail = api.getWhiteboard(wb.id)!
    expect(detail.connections).toHaveLength(1)
    expect(detail.connections[0].id).toBe(conn.id)
  })
})

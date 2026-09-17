import { beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../src/main/db/client'
import { createServices, type Services } from '../src/main/services'

let api: Services
beforeEach(() => {
  api = createServices(openDatabase(':memory:'))
})

describe('folders', () => {
  it('creates, nests, and lists folders', () => {
    const client = api.createFolder({ name: 'XY GmbH' })
    expect(client.name).toBe('XY GmbH')
    expect(client.parentId).toBeNull()
    const sub = api.createFolder({ name: '2026 projects', parentId: client.id })
    expect(sub.parentId).toBe(client.id)
    const listed = api.listFolders()
    expect(listed.map((f) => f.id).sort()).toEqual([client.id, sub.id].sort())
  })

  it('renames a folder', () => {
    const f = api.createFolder({ name: 'Draft' })
    const renamed = api.renameFolder(f.id, 'Clients')
    expect(renamed.name).toBe('Clients')
    expect(api.listFolders()[0].name).toBe('Clients')
  })

  it('moves a whiteboard into and out of a folder', () => {
    const folder = api.createFolder({ name: 'Clients' })
    const board = api.createWhiteboard({ name: 'Board A' })
    expect(board.folderId).toBeNull()
    api.moveWhiteboardToFolder(board.id, folder.id)
    expect(api.listWhiteboards().find((b) => b.id === board.id)!.folderId).toBe(folder.id)
    api.moveWhiteboardToFolder(board.id, null)
    expect(api.listWhiteboards().find((b) => b.id === board.id)!.folderId).toBeNull()
  })

  it('also creates a whiteboard directly inside a folder', () => {
    const folder = api.createFolder({ name: 'Clients' })
    const board = api.createWhiteboard({ name: 'Board A', folderId: folder.id })
    expect(board.folderId).toBe(folder.id)
  })

  it('deleting a folder promotes its whiteboards and subfolders to the parent level, without deleting whiteboards', () => {
    const parent = api.createFolder({ name: 'Parent' })
    const child = api.createFolder({ name: 'Child', parentId: parent.id })
    const grandchild = api.createFolder({ name: 'Grandchild', parentId: child.id })
    const board = api.createWhiteboard({ name: 'Board', folderId: child.id })

    api.deleteFolder(child.id)

    const remaining = api.listFolders()
    expect(remaining.map((f) => f.id)).not.toContain(child.id)
    expect(remaining.find((f) => f.id === grandchild.id)!.parentId).toBe(parent.id)
    const boardAfter = api.listWhiteboards().find((b) => b.id === board.id)!
    expect(boardAfter).toBeTruthy()
    expect(boardAfter.folderId).toBe(parent.id)
  })

  it('deleting a top-level folder promotes children to the root', () => {
    const folder = api.createFolder({ name: 'Solo' })
    const board = api.createWhiteboard({ name: 'Board', folderId: folder.id })
    api.deleteFolder(folder.id)
    expect(api.listWhiteboards().find((b) => b.id === board.id)!.folderId).toBeNull()
  })

  it('moves a folder to a new parent', () => {
    const a = api.createFolder({ name: 'A' })
    const b = api.createFolder({ name: 'B' })
    api.moveFolder(b.id, a.id)
    expect(api.listFolders().find((f) => f.id === b.id)!.parentId).toBe(a.id)
    api.moveFolder(b.id, null)
    expect(api.listFolders().find((f) => f.id === b.id)!.parentId).toBeNull()
  })

  it('prevents cycles when moving a folder into its own descendant', () => {
    const a = api.createFolder({ name: 'A' })
    const b = api.createFolder({ name: 'B', parentId: a.id })
    const c = api.createFolder({ name: 'C', parentId: b.id })
    expect(() => api.moveFolder(a.id, c.id)).toThrow()
    expect(() => api.moveFolder(a.id, b.id)).toThrow()
    expect(() => api.moveFolder(a.id, a.id)).toThrow()
  })
})

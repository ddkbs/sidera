import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { describe, expect, it } from 'vitest'
import { migrate, openDatabase, type DB } from '../src/main/db/client'
import { migrations } from '../src/main/db/migrations'
import * as schema from '../src/main/db/schema'
import { createServices, defaultProfileName, memoryProfileStore } from '../src/main/services'

const setup = () => {
  const store = memoryProfileStore()
  const changes: string[] = []
  const api = createServices(openDatabase(':memory:'), (s) => changes.push(s), store)
  return { api, store, changes }
}

describe('profiles', () => {
  it('creates a default active profile named after the macOS user on first start', () => {
    const { api, store } = setup()
    const profiles = api.listProfiles()
    expect(profiles).toHaveLength(1)
    expect(profiles[0].name).toBe(defaultProfileName())
    expect(profiles[0].name[0]).toBe(profiles[0].name[0].toUpperCase())
    expect(store.get()).toBe(profiles[0].id)
    expect(api.getActiveProfile().id).toBe(profiles[0].id)
  })

  it('reuses an existing profile when the stored active id is stale', () => {
    const db = openDatabase(':memory:')
    const id = createServices(db, () => {}, memoryProfileStore()).getActiveProfile().id
    const again = createServices(db, () => {}, memoryProfileStore('gone'))
    expect(again.getActiveProfile().id).toBe(id)
    expect(again.listProfiles()).toHaveLength(1)
  })

  it('creates, updates, switches and deletes profiles', () => {
    const { api, changes } = setup()
    const me = api.getActiveProfile()
    const ada = api.createProfile({ name: '  Ada ', email: 'ada@example.com', color: 'purple' })
    expect(ada).toMatchObject({ name: 'Ada', email: 'ada@example.com', color: 'purple', avatarUrl: null })
    expect(changes).toContain('profiles')
    expect(() => api.createProfile({ name: ' ' })).toThrow()
    expect(() => api.createProfile({ name: 'X', email: 'nope' })).toThrow()
    expect(() => api.createProfile({ name: 'X', color: 'neon' })).toThrow()

    const updated = api.updateProfile({ id: ada.id, name: 'Ada L.', email: '' })
    expect(updated.name).toBe('Ada L.')
    expect(updated.email).toBeNull()

    expect(api.setActiveProfile(ada.id).id).toBe(ada.id)
    expect(api.getActiveProfile().id).toBe(ada.id)
    expect(() => api.deleteProfile(ada.id)).toThrow(/active/)
    api.deleteProfile(me.id)
    expect(api.listProfiles().map((p) => p.id)).toEqual([ada.id])
    expect(() => api.deleteProfile(ada.id)).toThrow()
  })

  it('sets an avatar from an imported image file only', () => {
    const { api } = setup()
    const me = api.getActiveProfile()
    const img = api.registerFile({ name: 'me.png', mime: 'image/png', path: '/tmp/me.png', size: 10 })
    const pdf = api.registerFile({ name: 'cv.pdf', mime: 'application/pdf', path: '/tmp/cv.pdf', size: 10 })
    expect(api.updateProfile({ id: me.id, avatarFileId: img.id }).avatarUrl).toBe(`sidera-file://files/${img.id}`)
    expect(() => api.updateProfile({ id: me.id, avatarFileId: pdf.id })).toThrow(/image/)
    expect(api.updateProfile({ id: me.id, avatarFileId: null }).avatarUrl).toBeNull()
  })

  it('authors task comments with the active profile', () => {
    const { api } = setup()
    const card = api.createCard({ title: 'Launch', markdown: '- [ ] ship it' })
    const [task] = api.listTasks({ status: 'all' }).filter((t) => t.cardId === card.id)
    const me = api.getActiveProfile()
    const c1 = api.addTaskComment({ cardId: card.id, taskId: task.taskId, body: 'mine' })
    expect(c1.author).toEqual({ id: me.id, name: me.name, color: me.color, avatarUrl: null })

    const bob = api.createProfile({ name: 'Bob' })
    api.setActiveProfile(bob.id)
    api.addTaskComment({ cardId: card.id, taskId: task.taskId, body: 'his' })
    api.updateProfile({ id: bob.id, name: 'Robert' })
    expect(api.listTaskComments(card.id, task.taskId).map((c) => c.author?.name)).toEqual([me.name, 'Robert'])

    api.setActiveProfile(me.id)
    api.deleteProfile(bob.id)
    expect(api.listTaskComments(card.id, task.taskId).map((c) => c.author?.name ?? null)).toEqual([me.name, null])
  })

  it('assigns comments written before profiles existed to the default profile', () => {
    const raw = new Database(':memory:')
    raw.pragma('foreign_keys = ON')
    for (const m of migrations.slice(0, 4)) raw.exec(m)
    raw.pragma('user_version = 4')
    raw.prepare(`INSERT INTO cards (id, title, created_at, updated_at) VALUES ('c1', 'Old', 1, 1)`).run()
    raw.prepare(`INSERT INTO task_comments (id, card_id, task_id, body, created_at, updated_at) VALUES ('k1', 'c1', 't1', 'old', 1, 1)`).run()
    migrate(raw)
    const api = createServices(drizzle(raw, { schema }) as DB)
    const [comment] = api.listTaskComments('c1', 't1')
    expect(comment.author?.id).toBe(api.getActiveProfile().id)
  })
})

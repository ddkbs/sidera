import { integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const cards = sqliteTable('cards', {
  id: text('id').primaryKey(),
  title: text('title').notNull().default(''),
  content: text('content').notNull(),
  contentText: text('content_text').notNull().default(''),
  color: text('color'),
  icon: text('icon'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at')
})

export const tags = sqliteTable('tags', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  color: text('color').notNull().default('gray'),
  createdAt: integer('created_at').notNull()
})

export const cardTags = sqliteTable(
  'card_tags',
  { cardId: text('card_id').notNull(), tagId: text('tag_id').notNull() },
  (t) => [primaryKey({ columns: [t.cardId, t.tagId] })]
)

export const tagProperties = sqliteTable('tag_properties', {
  id: text('id').primaryKey(),
  tagId: text('tag_id').notNull(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  options: text('options').notNull().default('[]'),
  position: real('position').notNull().default(0)
})

export const cardPropertyValues = sqliteTable(
  'card_property_values',
  {
    cardId: text('card_id').notNull(),
    propertyId: text('property_id').notNull(),
    value: text('value'),
    position: real('position').notNull().default(0)
  },
  (t) => [primaryKey({ columns: [t.cardId, t.propertyId] })]
)

export const backlinks = sqliteTable(
  'backlinks',
  { sourceCardId: text('source_card_id').notNull(), targetCardId: text('target_card_id').notNull() },
  (t) => [primaryKey({ columns: [t.sourceCardId, t.targetCardId] })]
)

export const folders = sqliteTable('folders', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  parentId: text('parent_id'),
  position: real('position').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
})

export const whiteboards = sqliteTable('whiteboards', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  parentId: text('parent_id'),
  folderId: text('folder_id'),
  viewport: text('viewport').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at')
})

export const whiteboardObjects = sqliteTable('whiteboard_objects', {
  id: text('id').primaryKey(),
  whiteboardId: text('whiteboard_id').notNull(),
  kind: text('kind').notNull(),
  refId: text('ref_id'),
  x: real('x').notNull(),
  y: real('y').notNull(),
  width: real('width').notNull(),
  height: real('height').notNull(),
  z: integer('z').notNull().default(0),
  color: text('color'),
  data: text('data').notNull().default('{}')
})

export const connections = sqliteTable('connections', {
  id: text('id').primaryKey(),
  whiteboardId: text('whiteboard_id').notNull(),
  sourceId: text('source_id').notNull(),
  targetId: text('target_id').notNull(),
  label: text('label').notNull().default(''),
  data: text('data').notNull().default('{}')
})

export const files = sqliteTable('files', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  mime: text('mime').notNull(),
  path: text('path').notNull(),
  size: integer('size').notNull(),
  createdAt: integer('created_at').notNull()
})

export const taskComments = sqliteTable('task_comments', {
  id: text('id').primaryKey(),
  cardId: text('card_id').notNull(),
  taskId: text('task_id').notNull(),
  body: text('body').notNull().default(''),
  authorId: text('author_id'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
})

export const profiles = sqliteTable('profiles', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email'),
  avatarFileId: text('avatar_file_id'),
  color: text('color').notNull().default('blue'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
})

export const taskCommentFiles = sqliteTable(
  'task_comment_files',
  { commentId: text('comment_id').notNull(), fileId: text('file_id').notNull() },
  (t) => [primaryKey({ columns: [t.commentId, t.fileId] })]
)

export const taskMeta = sqliteTable(
  'task_meta',
  {
    cardId: text('card_id').notNull(),
    taskId: text('task_id').notNull(),
    status: text('status').notNull().default('todo'),
    priority: text('priority').notNull().default('none'),
    assigneeProfileId: text('assignee_profile_id'),
    dueDate: text('due_date'),
    createdByProfileId: text('created_by_profile_id'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull()
  },
  (t) => [primaryKey({ columns: [t.cardId, t.taskId] })]
)

export const taskActivity = sqliteTable('task_activity', {
  id: text('id').primaryKey(),
  cardId: text('card_id').notNull(),
  taskId: text('task_id').notNull(),
  actorProfileId: text('actor_profile_id'),
  kind: text('kind').notNull(),
  fromValue: text('from_value'),
  toValue: text('to_value'),
  createdAt: integer('created_at').notNull()
})

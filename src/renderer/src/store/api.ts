import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react'
import type { CanvasApi, DbChangeScope } from '@shared/api'

type Api = CanvasApi
type Arg<K extends keyof Api> = Parameters<Api[K]>
type Res<K extends keyof Api> = Awaited<ReturnType<Api[K]>>

const call = async <K extends keyof Api>(name: K, ...args: Arg<K>): Promise<{ data: Res<K> } | { error: string }> => {
  try {
    const fn = window.api[name] as (...a: Arg<K>) => Promise<Res<K>>
    return { data: await fn(...args) }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export const TAGS = ['Card', 'CardList', 'Tag', 'Whiteboard', 'Kanban', 'Task', 'TaskComment'] as const

export const api = createApi({
  reducerPath: 'data',
  baseQuery: fakeBaseQuery<string>(),
  tagTypes: TAGS,
  endpoints: (b) => ({
    // cards
    listCards: b.query<Res<'listCards'>, Arg<'listCards'>[0] | void>({
      queryFn: (opts) => call('listCards', opts ?? undefined),
      providesTags: ['CardList']
    }),
    getCard: b.query<Res<'getCard'>, string>({
      queryFn: (id) => call('getCard', id),
      providesTags: (_r, _e, id) => [{ type: 'Card', id }]
    }),
    createCard: b.mutation<Res<'createCard'>, Arg<'createCard'>[0]>({
      queryFn: (input) => call('createCard', input),
      invalidatesTags: ['CardList', 'Kanban']
    }),
    updateCard: b.mutation<Res<'updateCard'>, Arg<'updateCard'>[0]>({
      queryFn: (input) => call('updateCard', input),
      invalidatesTags: ['CardList', 'Whiteboard', 'Kanban']
    }),
    deleteCard: b.mutation<void, string>({
      queryFn: (id) => call('deleteCard', id),
      invalidatesTags: ['CardList', 'Whiteboard', 'Kanban', 'Card']
    }),

    // tags
    listTags: b.query<Res<'listTags'>, void>({ queryFn: () => call('listTags'), providesTags: ['Tag'] }),
    createTag: b.mutation<Res<'createTag'>, Arg<'createTag'>[0]>({
      queryFn: (input) => call('createTag', input),
      invalidatesTags: ['Tag']
    }),
    updateTag: b.mutation<Res<'updateTag'>, Arg<'updateTag'>[0]>({
      queryFn: (input) => call('updateTag', input),
      invalidatesTags: ['Tag', 'Card', 'CardList', 'Kanban']
    }),
    deleteTag: b.mutation<void, string>({
      queryFn: (id) => call('deleteTag', id),
      invalidatesTags: ['Tag', 'Card', 'CardList', 'Kanban']
    }),
    setCardTags: b.mutation<void, { cardId: string; tagIds: string[] }>({
      queryFn: ({ cardId, tagIds }) => call('setCardTags', cardId, tagIds),
      invalidatesTags: (_r, _e, { cardId }) => [{ type: 'Card', id: cardId }, 'CardList', 'Kanban', 'Whiteboard']
    }),
    setPropertyValue: b.mutation<void, { cardId: string; propertyId: string; value: unknown }>({
      queryFn: ({ cardId, propertyId, value }) => call('setPropertyValue', cardId, propertyId, value),
      invalidatesTags: (_r, _e, { cardId }) => [{ type: 'Card', id: cardId }, 'Kanban', 'CardList']
    }),
    listProperties: b.query<Res<'listProperties'>, string>({
      queryFn: (tagId) => call('listProperties', tagId),
      providesTags: ['Tag']
    }),
    createProperty: b.mutation<Res<'createProperty'>, Arg<'createProperty'>[0]>({
      queryFn: (input) => call('createProperty', input),
      invalidatesTags: ['Tag', 'Card', 'Kanban']
    }),
    updateProperty: b.mutation<Res<'updateProperty'>, Arg<'updateProperty'>[0]>({
      queryFn: (input) => call('updateProperty', input),
      invalidatesTags: ['Kanban', 'Card', 'Tag']
    }),

    // kanban
    getKanban: b.query<Res<'getKanban'>, { tagId: string; propertyId?: string }>({
      queryFn: ({ tagId, propertyId }) => call('getKanban', tagId, propertyId),
      providesTags: ['Kanban']
    }),
    moveKanbanItem: b.mutation<void, Arg<'moveKanbanItem'>[0]>({
      queryFn: (input) => call('moveKanbanItem', input),
      invalidatesTags: (_r, _e, { cardId }) => ['Kanban', { type: 'Card', id: cardId }]
    }),

    // whiteboards
    listWhiteboards: b.query<Res<'listWhiteboards'>, void>({
      queryFn: () => call('listWhiteboards'),
      providesTags: [{ type: 'Whiteboard', id: 'LIST' }]
    }),
    getWhiteboard: b.query<Res<'getWhiteboard'>, string>({
      queryFn: (id) => call('getWhiteboard', id),
      providesTags: (_r, _e, id) => [{ type: 'Whiteboard', id }, 'Whiteboard']
    }),
    createWhiteboard: b.mutation<Res<'createWhiteboard'>, Arg<'createWhiteboard'>[0]>({
      queryFn: (input) => call('createWhiteboard', input),
      invalidatesTags: ['Whiteboard']
    }),
    updateWhiteboard: b.mutation<Res<'updateWhiteboard'>, Arg<'updateWhiteboard'>[0]>({
      queryFn: (input) => call('updateWhiteboard', input),
      invalidatesTags: (_r, _e, { name }) => (name !== undefined ? ['Whiteboard'] : [])
    }),
    deleteWhiteboard: b.mutation<void, string>({
      queryFn: (id) => call('deleteWhiteboard', id),
      invalidatesTags: ['Whiteboard']
    }),
    moveWhiteboardToFolder: b.mutation<void, { whiteboardId: string; folderId: string | null }>({
      queryFn: ({ whiteboardId, folderId }) => call('moveWhiteboardToFolder', whiteboardId, folderId),
      invalidatesTags: ['Whiteboard']
    }),

    // folders
    listFolders: b.query<Res<'listFolders'>, void>({
      queryFn: () => call('listFolders'),
      providesTags: ['Whiteboard']
    }),
    createFolder: b.mutation<Res<'createFolder'>, Arg<'createFolder'>[0]>({
      queryFn: (input) => call('createFolder', input),
      invalidatesTags: ['Whiteboard']
    }),
    renameFolder: b.mutation<Res<'renameFolder'>, { id: string; name: string }>({
      queryFn: ({ id, name }) => call('renameFolder', id, name),
      invalidatesTags: ['Whiteboard']
    }),
    deleteFolder: b.mutation<void, string>({
      queryFn: (id) => call('deleteFolder', id),
      invalidatesTags: ['Whiteboard']
    }),
    moveFolder: b.mutation<void, { id: string; parentId: string | null }>({
      queryFn: ({ id, parentId }) => call('moveFolder', id, parentId),
      invalidatesTags: ['Whiteboard']
    }),
    addObject: b.mutation<Res<'addObject'>, Arg<'addObject'>[0]>({
      queryFn: (input) => call('addObject', input),
      invalidatesTags: (_r, _e, { whiteboardId, refId }) => [{ type: 'Whiteboard', id: whiteboardId }, ...(refId ? [{ type: 'Card' as const, id: refId }] : [])]
    }),
    removeObjects: b.mutation<void, { whiteboardId: string; ids: string[] }>({
      queryFn: ({ ids }) => call('removeObjects', ids),
      invalidatesTags: ['Whiteboard', 'Card']
    }),
    addConnection: b.mutation<Res<'addConnection'>, Arg<'addConnection'>[0]>({
      queryFn: (input) => call('addConnection', input),
      invalidatesTags: (_r, _e, { whiteboardId }) => [{ type: 'Whiteboard', id: whiteboardId }]
    }),
    removeConnections: b.mutation<void, { whiteboardId: string; ids: string[] }>({
      queryFn: ({ ids }) => call('removeConnections', ids),
      invalidatesTags: (_r, _e, { whiteboardId }) => [{ type: 'Whiteboard', id: whiteboardId }]
    }),

    // tasks
    listTasks: b.query<Res<'listTasks'>, Arg<'listTasks'>[0] | void>({
      queryFn: (opts) => call('listTasks', opts ?? undefined),
      providesTags: ['Task']
    }),
    setTaskChecked: b.mutation<void, { cardId: string; index: number; checked: boolean }>({
      queryFn: ({ cardId, index, checked }) => call('setTaskChecked', cardId, index, checked),
      invalidatesTags: (_r, _e, { cardId }) => ['Task', 'CardList', { type: 'Card' as const, id: cardId }]
    }),

    addTask: b.mutation<Res<'addTask'>, Arg<'addTask'>[0]>({
      queryFn: (input) => call('addTask', input),
      invalidatesTags: (r) => ['Task', 'CardList', ...(r ? [{ type: 'Card' as const, id: r.cardId }] : [])]
    }),

    // task comments
    listTaskComments: b.query<Res<'listTaskComments'>, { cardId: string; taskId: string }>({
      queryFn: ({ cardId, taskId }) => call('listTaskComments', cardId, taskId),
      providesTags: (_r, _e, { taskId }) => [{ type: 'TaskComment', id: taskId }]
    }),
    addTaskComment: b.mutation<Res<'addTaskComment'>, Arg<'addTaskComment'>[0]>({
      queryFn: (input) => call('addTaskComment', input),
      invalidatesTags: (_r, _e, { taskId }) => [{ type: 'TaskComment', id: taskId }, 'Task']
    }),
    updateTaskComment: b.mutation<Res<'updateTaskComment'>, Arg<'updateTaskComment'>[0] & { taskId: string }>({
      queryFn: ({ id, body }) => call('updateTaskComment', { id, body }),
      invalidatesTags: (_r, _e, { taskId }) => [{ type: 'TaskComment', id: taskId }]
    }),
    deleteTaskComment: b.mutation<void, { id: string; taskId: string }>({
      queryFn: ({ id }) => call('deleteTaskComment', id),
      invalidatesTags: (_r, _e, { taskId }) => [{ type: 'TaskComment', id: taskId }, 'Task']
    }),
    importFileData: b.mutation<Res<'importFileData'>, Arg<'importFileData'>[0]>({
      queryFn: (input) => call('importFileData', input)
    }),

    // search & meta
    search: b.query<Res<'search'>, string>({
      queryFn: (q) => call('search', q, 30),
      providesTags: ['CardList', 'Whiteboard'],
      keepUnusedDataFor: 5
    }),
    getMcpInfo: b.query<Res<'getMcpInfo'>, void>({ queryFn: () => call('getMcpInfo') }),

    // web clipper
    clipUrl: b.mutation<Res<'clipUrl'>, Arg<'clipUrl'>[0]>({
      queryFn: (input) => call('clipUrl', input),
      invalidatesTags: ['CardList']
    })
  })
})

/** Map main-process change scopes (e.g. MCP writes) to cache invalidation. */
export const scopeTags: Record<DbChangeScope, (typeof TAGS)[number][]> = {
  cards: ['Card', 'CardList', 'Kanban', 'Whiteboard', 'Task', 'TaskComment'],
  tags: ['Tag', 'Kanban', 'Card'],
  whiteboards: ['Whiteboard'],
  all: [...TAGS]
}

export const {
  useListCardsQuery,
  useGetCardQuery,
  useCreateCardMutation,
  useUpdateCardMutation,
  useDeleteCardMutation,
  useListTagsQuery,
  useCreateTagMutation,
  useUpdateTagMutation,
  useDeleteTagMutation,
  useSetCardTagsMutation,
  useSetPropertyValueMutation,
  useUpdatePropertyMutation,
  useListPropertiesQuery,
  useCreatePropertyMutation,
  useGetKanbanQuery,
  useMoveKanbanItemMutation,
  useListWhiteboardsQuery,
  useGetWhiteboardQuery,
  useCreateWhiteboardMutation,
  useUpdateWhiteboardMutation,
  useDeleteWhiteboardMutation,
  useMoveWhiteboardToFolderMutation,
  useListFoldersQuery,
  useCreateFolderMutation,
  useRenameFolderMutation,
  useDeleteFolderMutation,
  useMoveFolderMutation,
  useAddObjectMutation,
  useRemoveObjectsMutation,
  useAddConnectionMutation,
  useRemoveConnectionsMutation,
  useListTasksQuery,
  useSetTaskCheckedMutation,
  useAddTaskMutation,
  useListTaskCommentsQuery,
  useAddTaskCommentMutation,
  useUpdateTaskCommentMutation,
  useDeleteTaskCommentMutation,
  useImportFileDataMutation,
  useSearchQuery,
  useGetMcpInfoQuery,
  useClipUrlMutation
} = api

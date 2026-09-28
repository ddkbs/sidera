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

export const TAGS = ['Card', 'CardList', 'Tag', 'Whiteboard', 'Kanban', 'Task', 'TaskComment', 'Profile', 'Highlight'] as const

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
    listWhiteboardsWithStats: b.query<Res<'listWhiteboardsWithStats'>, void>({
      queryFn: () => call('listWhiteboardsWithStats'),
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
    duplicateWhiteboard: b.mutation<Res<'duplicateWhiteboard'>, string>({
      queryFn: (id) => call('duplicateWhiteboard', id),
      invalidatesTags: ['Whiteboard']
    }),
    updateWhiteboardProperties: b.mutation<Res<'updateWhiteboardProperties'>, { whiteboardId: string; properties: Arg<'updateWhiteboardProperties'>[1] }>({
      queryFn: ({ whiteboardId, properties }) => call('updateWhiteboardProperties', whiteboardId, properties),
      invalidatesTags: (_r, _e, { whiteboardId }) => [{ type: 'Whiteboard', id: whiteboardId }, 'Whiteboard']
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
    addTextBlock: b.mutation<Res<'addTextBlock'>, Arg<'addTextBlock'>[0]>({
      queryFn: (input) => call('addTextBlock', input),
      invalidatesTags: (_r, _e, { whiteboardId }) => [{ type: 'Whiteboard', id: whiteboardId }]
    }),
    chartFromTable: b.mutation<Res<'chartFromTable'>, Arg<'chartFromTable'>[0] & { whiteboardId: string }>({
      queryFn: ({ whiteboardId: _w, ...input }) => call('chartFromTable', input),
      invalidatesTags: (_r, _e, { whiteboardId }) => [{ type: 'Whiteboard', id: whiteboardId }]
    }),
    removeObjects: b.mutation<void, { whiteboardId: string; ids: string[] }>({
      queryFn: ({ ids }) => call('removeObjects', ids),
      invalidatesTags: ['Whiteboard', 'Card']
    }),
    addConnection: b.mutation<Res<'addConnection'>, Arg<'addConnection'>[0]>({
      queryFn: (input) => call('addConnection', input),
      invalidatesTags: (_r, _e, { whiteboardId }) => [{ type: 'Whiteboard', id: whiteboardId }]
    }),
    updateConnection: b.mutation<void, Arg<'updateConnection'>[0] & { whiteboardId: string }>({
      queryFn: ({ whiteboardId: _w, ...input }) => call('updateConnection', input),
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
    updateTask: b.mutation<Res<'updateTask'>, Arg<'updateTask'>[0]>({
      queryFn: (input) => call('updateTask', input),
      // optimistic: status/priority/assignee/due show up instantly (board drag & drop, pickers)
      async onQueryStarted(patch, { dispatch, getState, queryFulfilled }) {
        const profiles = api.endpoints.listProfiles.select()(getState() as never).data ?? []
        const undos = api.util.selectInvalidatedBy(getState() as never, ['Task']).filter((e) => e.endpointName === 'listTasks').map((e) =>
          dispatch(
            api.util.updateQueryData('listTasks', e.originalArgs as Arg<'listTasks'>[0], (draft) => {
              const t = draft.find((x) => x.cardId === patch.cardId && x.taskId === patch.taskId)
              if (!t) return
              if (patch.status !== undefined) {
                t.status = patch.status
                t.checked = patch.status === 'done'
              }
              if (patch.priority !== undefined) t.priority = patch.priority
              if (patch.dueDate !== undefined) t.dueDate = patch.dueDate
              if (patch.text !== undefined) t.text = patch.text
              if (patch.assigneeId !== undefined) {
                const p = profiles.find((x) => x.id === patch.assigneeId)
                t.assignee = p ? { id: p.id, name: p.name, color: p.color, avatarUrl: p.avatarUrl } : null
              }
            })
          )
        )
        try {
          await queryFulfilled
        } catch {
          undos.forEach((u) => u.undo())
        }
      },
      invalidatesTags: (_r, _e, { cardId, taskId }) => ['Task', 'CardList', { type: 'Card' as const, id: cardId }, { type: 'TaskComment' as const, id: taskId }]
    }),
    listTaskActivity: b.query<Res<'listTaskActivity'>, { cardId: string; taskId: string }>({
      queryFn: ({ cardId, taskId }) => call('listTaskActivity', cardId, taskId),
      providesTags: (_r, _e, { taskId }) => [{ type: 'TaskComment', id: taskId }]
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
    // profiles
    listProfiles: b.query<Res<'listProfiles'>, void>({
      queryFn: () => call('listProfiles'),
      providesTags: ['Profile']
    }),
    getActiveProfile: b.query<Res<'getActiveProfile'>, void>({
      queryFn: () => call('getActiveProfile'),
      providesTags: ['Profile']
    }),
    createProfile: b.mutation<Res<'createProfile'>, Arg<'createProfile'>[0]>({
      queryFn: (input) => call('createProfile', input),
      invalidatesTags: ['Profile']
    }),
    updateProfile: b.mutation<Res<'updateProfile'>, Arg<'updateProfile'>[0]>({
      queryFn: (input) => call('updateProfile', input),
      invalidatesTags: ['Profile', 'TaskComment']
    }),
    deleteProfile: b.mutation<void, string>({
      queryFn: (id) => call('deleteProfile', id),
      invalidatesTags: ['Profile', 'TaskComment']
    }),
    setActiveProfile: b.mutation<Res<'setActiveProfile'>, string>({
      queryFn: (id) => call('setActiveProfile', id),
      invalidatesTags: ['Profile']
    }),
    importFileData: b.mutation<Res<'importFileData'>, Arg<'importFileData'>[0]>({
      queryFn: (input) => call('importFileData', input)
    }),

    // pdf highlights
    listHighlights: b.query<Res<'listHighlights'>, string>({
      queryFn: (fileId) => call('listHighlights', fileId),
      providesTags: (_r, _e, fileId) => [{ type: 'Highlight', id: fileId }]
    }),
    createHighlight: b.mutation<Res<'createHighlight'>, Arg<'createHighlight'>[0]>({
      queryFn: (input) => call('createHighlight', input),
      invalidatesTags: (_r, _e, { fileId }) => [{ type: 'Highlight', id: fileId }]
    }),
    updateHighlight: b.mutation<Res<'updateHighlight'>, Arg<'updateHighlight'>[0] & { fileId: string }>({
      queryFn: ({ fileId: _f, ...input }) => call('updateHighlight', input),
      invalidatesTags: (_r, _e, { fileId }) => [{ type: 'Highlight', id: fileId }]
    }),
    deleteHighlight: b.mutation<void, { id: string; fileId: string }>({
      queryFn: ({ id }) => call('deleteHighlight', id),
      invalidatesTags: (_r, _e, { fileId }) => [{ type: 'Highlight', id: fileId }]
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
  profiles: ['Profile', 'TaskComment'],
  files: ['Highlight'],
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
  useListWhiteboardsWithStatsQuery,
  useGetWhiteboardQuery,
  useCreateWhiteboardMutation,
  useUpdateWhiteboardMutation,
  useDeleteWhiteboardMutation,
  useMoveWhiteboardToFolderMutation,
  useDuplicateWhiteboardMutation,
  useUpdateWhiteboardPropertiesMutation,
  useListFoldersQuery,
  useCreateFolderMutation,
  useRenameFolderMutation,
  useDeleteFolderMutation,
  useMoveFolderMutation,
  useAddObjectMutation,
  useAddTextBlockMutation,
  useChartFromTableMutation,
  useRemoveObjectsMutation,
  useAddConnectionMutation,
  useRemoveConnectionsMutation,
  useListTasksQuery,
  useSetTaskCheckedMutation,
  useAddTaskMutation,
  useUpdateTaskMutation,
  useListTaskActivityQuery,
  useListTaskCommentsQuery,
  useAddTaskCommentMutation,
  useUpdateTaskCommentMutation,
  useDeleteTaskCommentMutation,
  useImportFileDataMutation,
  useListHighlightsQuery,
  useCreateHighlightMutation,
  useUpdateHighlightMutation,
  useDeleteHighlightMutation,
  useListProfilesQuery,
  useGetActiveProfileQuery,
  useCreateProfileMutation,
  useUpdateProfileMutation,
  useDeleteProfileMutation,
  useSetActiveProfileMutation,
  useSearchQuery,
  useGetMcpInfoQuery,
  useClipUrlMutation
} = api

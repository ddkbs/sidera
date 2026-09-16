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

export const TAGS = ['Card', 'CardList', 'Tag', 'Whiteboard', 'Journal', 'Kanban'] as const

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
      invalidatesTags: (_r, _e, { cardId }) => [{ type: 'Card', id: cardId }, 'Kanban']
    }),
    updateProperty: b.mutation<Res<'updateProperty'>, Arg<'updateProperty'>[0]>({
      queryFn: (input) => call('updateProperty', input),
      invalidatesTags: ['Kanban', 'Card']
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

    // journal
    getJournal: b.query<Res<'getJournal'>, string>({
      queryFn: (date) => call('getJournal', date),
      providesTags: (_r, _e, date) => [{ type: 'Journal', id: date }]
    }),
    listJournal: b.query<Res<'listJournal'>, number | void>({
      queryFn: (limit) => call('listJournal', limit ?? 30),
      providesTags: ['Journal']
    }),

    // search & meta
    search: b.query<Res<'search'>, string>({
      queryFn: (q) => call('search', q, 30),
      providesTags: ['CardList', 'Whiteboard'],
      keepUnusedDataFor: 5
    }),
    getMcpInfo: b.query<Res<'getMcpInfo'>, void>({ queryFn: () => call('getMcpInfo') })
  })
})

/** Map main-process change scopes (e.g. MCP writes) to cache invalidation. */
export const scopeTags: Record<DbChangeScope, (typeof TAGS)[number][]> = {
  cards: ['Card', 'CardList', 'Kanban', 'Whiteboard'],
  tags: ['Tag', 'Kanban', 'Card'],
  whiteboards: ['Whiteboard'],
  journal: ['Journal'],
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
  useGetKanbanQuery,
  useMoveKanbanItemMutation,
  useListWhiteboardsQuery,
  useGetWhiteboardQuery,
  useCreateWhiteboardMutation,
  useUpdateWhiteboardMutation,
  useDeleteWhiteboardMutation,
  useAddObjectMutation,
  useRemoveObjectsMutation,
  useAddConnectionMutation,
  useRemoveConnectionsMutation,
  useGetJournalQuery,
  useListJournalQuery,
  useSearchQuery,
  useGetMcpInfoQuery
} = api

import { recordDelete } from '@/lib/undo-actions'
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Connection as RFConnection,
  type EdgeChange,
  type NodeChange,
  type OnNodeDrag,
  type Viewport
} from '@xyflow/react'
import dagre from 'dagre'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { Connection, ObjectKind, ObjectPatch, TextBlockStyle, WhiteboardDetail } from '@shared/types'
import { emptyTable } from '@shared/tables'
import { PALETTE } from '@/lib/colors'
import { firstUrl } from '@shared/util'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { t } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store'
import {
  api,
  useAddConnectionMutation,
  useAddObjectMutation,
  useAddTextBlockMutation,
  useChartFromTableMutation,
  useClipUrlMutation,
  useCreateCardMutation,
  useCreateWhiteboardMutation,
  useDeleteCardMutation,
  useGetWhiteboardQuery,
  useRemoveConnectionsMutation,
  useRemoveObjectsMutation
} from '@/store/api'
import { navigate, openCard, openPdf, openTab, queueChatMessage, setTool, type CanvasTool } from '@/store/ui'
import { AddCardDialog } from './AddCardDialog'
import { CARD_MIME, CardDrawer } from './CardDrawer'
import { FileViewer } from './FileViewer'
import { HIGHLIGHT_CARD_EVENT, HIGHLIGHT_MIME, readHighlightDrag, type HighlightDrag } from '@/features/pdf/dnd'
import { appendHighlight, highlightDoc, highlightTitle } from '@/features/pdf/highlight'
import { BoardBreadcrumb } from './BoardBreadcrumb'
import { FindOnBoard } from './FindOnBoard'
import { invert, opLabel, type HistoryOp } from './history'
import { record } from '@/lib/undo'
import { CanvasToolbar, TOOLS } from './CanvasToolbar'
import { CanvasContextMenu } from './CanvasContextMenu'
import { WhiteboardPropertiesDialog } from './WhiteboardPropertiesDialog'
import { EdgeMenu, type ConnectionPatch } from './EdgeMenu'
import { SelectionToolbar } from './SelectionToolbar'
import { arrange, bounds, type ArrangeMode } from './arrange'
import { CANVAS_ACTION_EVENT, type CanvasAction } from './actions'
import { localizeSample } from './sampleContent'
import { edgeTypes } from './FloatingEdge'
import { NodeMenu, type NodeMenuAction } from './NodeMenu'
import { nodeTypes } from './nodes'
import { SAVE_LINK_DONE_EVENT, SAVE_LINK_EVENT } from './nodes/LinkNode'
import { EDIT_SKETCH_EVENT } from './nodes/SketchNode'
import { DrawOnIpadDialog, SIDERA_DRAW_OPEN_EVENT } from '@/features/draw/DrawOnIpadDialog'
import { InkLayer } from '@/features/ink/InkLayer'
import { framelessSize, isFrameless, toggledFrameBox } from '@/features/ink/frame'
import { fitTransform, inkBounds, reboxed } from '@/features/ink/geometry'
import { buildShape, type ShapeKind } from '@/features/ink/shapes'
import type { DrawSubmission } from '@shared/drawProtocol'

const SketchEditor = lazy(() => import('./SketchEditor'))
import { persist, type ConnectionEdge, type ObjectNode } from './types'
import { ZoomControls } from './ZoomControls'
import { useCommands } from '@/lib/shortcuts'
import { defaultChart, type ChartType } from '@shared/charts'
import { BLOCK_DEFAULT_SIZE, TEXT_SIZE_PX, steppedSize, type TextSizePreset } from './textSize'
import './canvas.css'

export function WhiteboardView({ id }: { id: string }) {
  const { data, isLoading, isError } = useGetWhiteboardQuery(id)
  if (isLoading) return <Skeleton className="m-6 h-[calc(100%-3rem)] rounded-xl" />
  if (isError || !data) return <div className="grid h-full place-items-center text-sm text-muted-foreground">{t('canvas.notFound')}</div>
  return (
    <ReactFlowProvider>
      <Canvas detail={data} />
    </ReactFlowProvider>
  )
}

const toNodes = (d: WhiteboardDetail, prev: ObjectNode[] = [], autoEdit?: string): ObjectNode[] => {
  const prevById = new Map(prev.map((n) => [n.id, n]))
  const childNames = new Map(d.children.map((c) => [c.id, c.name]))
  return [...d.objects]
    .sort((a, b) => a.z - b.z)
    .map((o) => {
      const p = prevById.get(o.id)
      return {
        id: o.id,
        type: o.kind,
        position: p?.dragging ? p.position : { x: o.x, y: o.y },
        width: o.width,
        height: o.height,
        zIndex: o.kind === 'section' ? -1 : 0,
        selected: p?.selected ?? false,
        data: {
          object: o,
          card: o.refId ? d.cards[o.refId] : undefined,
          childName: o.refId ? childNames.get(o.refId) : undefined,
          autoEdit: autoEdit === o.id
        }
      }
    })
}

/** Stroke, dash pattern and arrow heads for a connection's stored styling. */
const edgeLook = (c: Connection): Pick<ConnectionEdge, 'style' | 'markerEnd' | 'markerStart'> => {
  const stroke = c.color ? PALETTE[c.color]?.fg : undefined
  const marker = { type: MarkerType.ArrowClosed, width: 18, height: 18, ...(stroke ? { color: stroke } : {}) }
  return {
    style: { stroke, strokeWidth: 1.8, strokeDasharray: c.lineStyle === 'dashed' ? '7 6' : undefined },
    markerEnd: c.arrows === 'none' ? undefined : marker,
    markerStart: c.arrows === 'both' ? marker : undefined
  }
}

const toEdges = (d: WhiteboardDetail, prev: ConnectionEdge[] = []): ConnectionEdge[] => {
  const sel = new Set(prev.filter((e) => e.selected).map((e) => e.id))
  return d.connections.map((c) => ({
    id: c.id,
    source: c.sourceId,
    target: c.targetId,
    type: 'floating',
    label: c.label || undefined,
    selected: sel.has(c.id),
    ...edgeLook(c),
    data: { label: c.label, connection: c }
  }))
}

/** Pointer travel (px) below which a right-button press counts as a click, not a pan. */
const RIGHT_CLICK_SLOP = 4

function Canvas({ detail }: { detail: WhiteboardDetail }) {
  const boardId = detail.whiteboard.id
  const dispatch = useAppDispatch()
  const tool = useAppSelector((s) => s.ui.tool)
  const snapToGrid = useAppSelector((s) => s.settings.canvas.snapToGrid)
  const rf = useReactFlow<ObjectNode, ConnectionEdge>()
  const [nodes, setNodes] = useState<ObjectNode[]>(() => toNodes(detail))
  const [edges, setEdges] = useState<ConnectionEdge[]>(() => toEdges(detail))
  const [searchOpen, setSearchOpen] = useState(false)
  const autoEdit = useRef<string | undefined>(undefined)
  /** object to select as soon as it shows up in the board data (e.g. a drawing from the iPad) */
  const autoSelect = useRef<string | undefined>(undefined)
  const connectFrom = useRef<string | null>(null)
  const sectionDrag = useRef<{ start: { x: number; y: number }; children: Map<string, { x: number; y: number }> } | null>(null)
  const wrapper = useRef<HTMLDivElement>(null)
  const dragBefore = useRef<ObjectPatch[]>([])
  const resizeBefore = useRef(new Map<string, ObjectPatch>())
  /** Push a canvas operation (already applied) onto the global undo stack. */
  const trackRef = useRef<(op: HistoryOp) => void>(() => {})
  trackRef.current = (op: HistoryOp) => {
    if (op.type === 'patch' && JSON.stringify(op.before) === JSON.stringify(op.after)) return
    record({ label: opLabel(op), undo: () => applyOp(invert(op)), redo: () => applyOp(op) })
  }
  const track = (op: HistoryOp): void => trackRef.current(op)
  const detailRef = useRef(detail)
  detailRef.current = detail
  const isBlock = (cardId: string | null | undefined): boolean => !!cardId && detailRef.current.cards[cardId]?.kind === 'block'
  /** Like `track`, but text block cards live and die with their placement (soft delete / restore). */
  const trackBlocks = (op: Extract<HistoryOp, { type: 'add' | 'remove' }>, cardIds: string[]): void => {
    if (!cardIds.length) return track(op)
    const hide = async () => {
      for (const c of cardIds) await window.api.deleteCard(c)
    }
    const show = async () => {
      for (const c of cardIds) await window.api.restoreCard(c)
    }
    const add = async (o: HistoryOp) => (await show(), await applyOp(o))
    const remove = async (o: HistoryOp) => (await applyOp(o), await hide())
    record({
      label: op.type === 'add' ? (op.objects.length === 1 ? t('undo.addTextBox') : opLabel(op)) : opLabel(op),
      undo: () => (op.type === 'add' ? remove(invert(op)) : add(invert(op))),
      redo: () => (op.type === 'add' ? add(op) : remove(op))
    })
  }
  /** Last pointer position over the board (screen px), for ⌘N. */
  const pointer = useRef<{ x: number; y: number } | null>(null)


  const [addObject] = useAddObjectMutation()
  const [addTextBlock] = useAddTextBlockMutation()
  const [chartFromTable] = useChartFromTableMutation()
  const [removeObjects] = useRemoveObjectsMutation()
  const [addConnection] = useAddConnectionMutation()
  const [removeConnections] = useRemoveConnectionsMutation()
  const [createCard] = useCreateCardMutation()
  const [createWhiteboard] = useCreateWhiteboardMutation()
  const [deleteCard] = useDeleteCardMutation()
  const [clipUrl] = useClipUrlMutation()
  const [viewing, setViewing] = useState<{ refId: string; name: string; mime: string } | null>(null)
  const [edgeMenu, setEdgeMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [paneMenu, setPaneMenu] = useState<{ x: number; y: number; flow: { x: number; y: number } } | null>(null)
  const [propertiesOpen, setPropertiesOpen] = useState(false)
  /** Where an action started that finishes in a dialog (add existing card, link preview). */
  const insertPos = useRef<{ x: number; y: number } | null>(null)
  /** Right-button press, to tell a right-click apart from a right-drag pan. */
  const rightDown = useRef<{ x: number; y: number; pane: boolean } | null>(null)
  const [sketchId, setSketchId] = useState<string | null>(null)
  const [drawOpen, setDrawOpen] = useState(false)
  const [linkDialog, setLinkDialog] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  useEffect(() => {
    const onEdit = (e: Event) => setSketchId((e as CustomEvent<string>).detail)
    const onDraw = () => setDrawOpen(true)
    window.addEventListener(EDIT_SKETCH_EVENT, onEdit)
    window.addEventListener(SIDERA_DRAW_OPEN_EVENT, onDraw)
    return () => {
      window.removeEventListener(EDIT_SKETCH_EVENT, onEdit)
      window.removeEventListener(SIDERA_DRAW_OPEN_EVENT, onDraw)
    }
  }, [])

  /** PDFs dock in the split-screen reader; other files still open in the modal viewer. */
  const openFileObject = useCallback(
    (refId: string, name: string, mime: string) => {
      if (mime === 'application/pdf') dispatch(openPdf({ fileId: refId, name }))
      else setViewing({ refId, name, mime })
    },
    [dispatch]
  )

  const [menu, setMenu] = useState<{ node: ObjectNode; x: number; y: number } | null>(null)
  /** Handlers defined further down, reachable from the node menu callback. */
  const late = useRef<{
    convertToCard: (cardId: string) => Promise<void>
    setBlockStyle: (nodeId: string, style: TextBlockStyle) => Promise<void>
    insertChartFromTable: (tableId: string) => Promise<void>
    unlinkChart: (nodeId: string) => Promise<void>
    setTextSizePreset: (nodes: ObjectNode[], preset: TextSizePreset) => Promise<void>
  }>(null!)

  const onMenuAction = useCallback(
    async (a: NodeMenuAction, node: ObjectNode) => {
      setMenu(null)
      const o = node.data.object
      if (a === 'open' && o.refId && node.type === 'file') openFileObject(o.refId, String(o.data.name ?? t('canvas.file')), String(o.data.mime ?? ''))
      else if (a === 'open' && o.refId) dispatch(node.type === 'whiteboard' ? navigate({ type: 'whiteboard', id: o.refId }) : openCard(o.refId))
      else if (a === 'remove') void rf.deleteElements({ nodes: [{ id: node.id }] })
      else if (a === 'delete-card' && o.refId) {
        await deleteCard(o.refId)
        recordDelete('card', o.refId)
      } else if (a === 'convert-card' && o.refId) void late.current.convertToCard(o.refId)
      else if (a === 'style-plain' || a === 'style-framed') void late.current.setBlockStyle(node.id, a === 'style-framed' ? 'framed' : 'plain')
      else if (a === 'chart-from-table') void late.current.insertChartFromTable(node.id)
      else if (a === 'unlink-chart') void late.current.unlinkChart(node.id)
      else if (a.startsWith('size-')) void late.current.setTextSizePreset([node], a.slice(5).toUpperCase() as TextSizePreset)
      else if (a === 'frame') {
        // "Remove frame" / "Add frame": ink on the board vs. a framed card — the ink stays where it is
        const box = { x: node.position.x, y: node.position.y, width: node.width ?? o.width, height: node.height ?? o.height }
        const frameless = !isFrameless(o.data)
        const next = toggledFrameBox(box, o.data.elements as unknown[] | undefined, frameless)
        const before: ObjectPatch = { id: o.id, ...box, data: o.data }
        const after: ObjectPatch = { id: o.id, ...next, data: { ...o.data, frameless } }
        await applyOp({ type: 'patch', before: [before], after: [after] })
        record({ label: frameless ? t('undo.removeFrame') : t('undo.addFrame'), undo: () => applyOp({ type: 'patch', before: [after], after: [before] }), redo: () => applyOp({ type: 'patch', before: [before], after: [after] }) })
      } else if (a === 'front' || a === 'back') {
        const zs = rf.getNodes().map((n) => n.data.object.z)
        const z = a === 'front' ? Math.max(...zs) + 1 : Math.min(...zs) - 1
        persist([{ id: node.id, z }])
        setNodes((ns) => {
          const rest = ns.filter((n) => n.id !== node.id)
          const me = { ...node, data: { ...node.data, object: { ...o, z } } }
          return a === 'front' ? [...rest, me] : [me, ...rest]
        })
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dispatch, rf, deleteCard]
  )

  useEffect(() => {
    setNodes((prev) => {
      const next = toNodes(detail, prev, autoEdit.current)
      const sel = autoSelect.current
      if (!sel || !next.some((n) => n.id === sel)) return next
      autoSelect.current = undefined
      return next.map((n) => ({ ...n, selected: n.id === sel }))
    })
    setEdges((prev) => toEdges(detail, prev))
    autoEdit.current = undefined
  }, [detail])

  const center = useCallback(() => {
    const r = wrapper.current?.getBoundingClientRect()
    return rf.screenToFlowPosition({ x: (r?.left ?? 0) + (r?.width ?? 800) / 2, y: (r?.top ?? 0) + (r?.height ?? 600) / 2 })
  }, [rf])

  const place = useCallback(
    async (kind: ObjectKind, pos: { x: number; y: number }, extra: { refId?: string; data?: Record<string, unknown>; color?: string; width?: number; height?: number } = {}) => {
      const res = await addObject({ whiteboardId: boardId, kind, x: pos.x, y: pos.y, ...extra })
      if ('error' in res) toast.error(t('canvas.addFailed'))
      if ('data' in res && res.data) track({ type: 'add', objects: [res.data], connections: [] })
      return 'data' in res ? res.data : undefined
    },
    [addObject, boardId]
  )

  // "Save as card" on a link node: clip the page to a card and connect it to the link node.
  useEffect(() => {
    const onSaveLink = (e: Event) => {
      const { nodeId, url } = (e as CustomEvent<{ nodeId: string; url: string }>).detail
      void (async () => {
        try {
          const res = await clipUrl({ url })
          if (!('data' in res) || !res.data) throw new Error('Clip failed')
          const linkNode = rf.getNode(nodeId)
          const x = (linkNode?.position.x ?? center().x) + (linkNode?.width ?? 320) + 60
          const y = linkNode?.position.y ?? center().y
          const o = await place('card', { x, y }, { refId: res.data.id, width: 300, height: 200 })
          if (o) {
            const conn = await addConnection({ whiteboardId: boardId, sourceId: nodeId, targetId: o.id })
            if ('data' in conn && conn.data) track({ type: 'add', objects: [], connections: [conn.data] })
          }
          toast.success(t('canvas.savedAsCard'))
        } catch {
          toast.error(t('canvas.saveAsCardFailed'))
        } finally {
          window.dispatchEvent(new CustomEvent(SAVE_LINK_DONE_EVENT, { detail: { nodeId } }))
        }
      })()
    }
    window.addEventListener(SAVE_LINK_EVENT, onSaveLink)
    return () => window.removeEventListener(SAVE_LINK_EVENT, onSaveLink)
  }, [clipUrl, rf, place, addConnection, boardId, center])

  const refreshBoard = useCallback(
    () => void dispatch(api.util.invalidateTags([{ type: 'Whiteboard' as const, id: boardId }, 'CardList', 'Card'])),
    [dispatch, boardId]
  )

  /** Drop of a PDF highlight on empty canvas: a new card with the quote, linked to the PDF's file node. */
  const cardFromHighlight = useCallback(
    async (h: HighlightDrag, pos: { x: number; y: number }) => {
      const card = await window.api.createCard({ title: highlightTitle(h.text), content: highlightDoc(h.text, h.fileName, h.page) })
      await window.api.updateCard({ id: card.id, color: h.color })
      const o = await window.api.addObject({ whiteboardId: boardId, kind: 'card', refId: card.id, x: pos.x - 150, y: pos.y - 40, width: 300, height: 190 })
      const fileNode = rf.getNodes().find((n) => n.type === 'file' && n.data.object.refId === h.fileId)
      const conn = fileNode ? await window.api.addConnection({ whiteboardId: boardId, sourceId: fileNode.id, targetId: o.id, label: t('pdf.pageLower', { n: h.page }) }) : null
      refreshBoard()
      record({
        label: t('pdf.undoCard'),
        undo: async () => {
          if (conn) await window.api.removeConnections([conn.id])
          await window.api.removeObjects([o.id])
          await window.api.deleteCard(card.id)
          refreshBoard()
        },
        redo: async () => {
          await window.api.restoreCard(card.id)
          await window.api.restoreObjects([o], conn ? [conn] : [])
          refreshBoard()
        }
      })
      toast.success(t('pdf.cardCreated'))
    },
    [boardId, rf, refreshBoard]
  )

  /** Drop of a highlight onto an existing card: append the quote instead of creating a card. */
  const quoteIntoCard = useCallback(
    async (h: HighlightDrag, cardId: string) => {
      const card = await window.api.getCard(cardId)
      if (!card) return
      const before = card.content
      const after = appendHighlight(before, h.text, h.fileName, h.page)
      await window.api.updateCard({ id: cardId, content: after })
      refreshBoard()
      record({
        label: t('undo.quoteIntoCard'),
        undo: async () => {
          await window.api.updateCard({ id: cardId, content: before })
          refreshBoard()
        },
        redo: async () => {
          await window.api.updateCard({ id: cardId, content: after })
          refreshBoard()
        }
      })
      toast.success(t('canvas.quoteAdded', { title: card.title || t('kanban.card') }))
    },
    [refreshBoard]
  )

  const dropHighlight = useCallback(
    async (h: HighlightDrag, pos: { x: number; y: number }, ontoNodeId?: string) => {
      const onto = ontoNodeId ? rf.getNode(ontoNodeId) : undefined
      if (onto?.type === 'card' && onto.data.object.refId) await quoteIntoCard(h, onto.data.object.refId)
      else await cardFromHighlight(h, pos)
    },
    [rf, quoteIntoCard, cardFromHighlight]
  )

  // "Create card" in the reader's selection bar: handle it here so the card lands on the open board.
  useEffect(() => {
    const onHighlightCard = (e: Event) => {
      const ev = e as CustomEvent<HighlightDrag>
      ev.preventDefault()
      void cardFromHighlight(ev.detail, center())
    }
    window.addEventListener(HIGHLIGHT_CARD_EVENT, onHighlightCard)
    return () => window.removeEventListener(HIGHLIGHT_CARD_EVENT, onHighlightCard)
  }, [cardFromHighlight, center])

  const newCardAt = useCallback(
    async (pos: { x: number; y: number }, title = '') => {
      const res = await createCard({ title })
      if (!('data' in res) || !res.data) return
      await place('card', { x: pos.x - 160, y: pos.y - 40 }, { refId: res.data.id })
      dispatch(openCard(res.data.id))
    },
    [createCard, place, dispatch]
  )

  /** A text block at `pos` (flow coords), straight into typing. */
  const newTextBlockAt = useCallback(
    async (pos: { x: number; y: number }) => {
      const res = await addTextBlock({ whiteboardId: boardId, x: pos.x - 10, y: pos.y - 18 })
      if (!('data' in res) || !res.data) return void toast.error(t('canvas.textBoxFailed'))
      const { card, object } = res.data
      autoEdit.current = object.id
      setNodes((ns) => ns.map((n) => (n.id === object.id ? { ...n, data: { ...n.data, autoEdit: true } } : n)))
      trackBlocks({ type: 'add', objects: [object], connections: [] }, [card.id])
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [addTextBlock, boardId]
  )

  /** Apply an object data change with undo (text block style, chart unlink, …). */
  const patchData = useCallback(
    async (nodeId: string, next: Record<string, unknown>, label: string) => {
      const before = rf.getNode(nodeId)?.data.object.data
      if (!before) return
      const apply = async (d: Record<string, unknown>) => {
        setNodes((ns) => ns.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, object: { ...n.data.object, data: d } } } : n)))
        await window.api.updateObjects([{ id: nodeId, data: d }])
        dispatch(api.util.invalidateTags([{ type: 'Whiteboard', id: boardId }]))
      }
      await apply(next)
      record({ label, undo: () => apply(before), redo: () => apply(next) })
    },
    [rf, dispatch, boardId]
  )

  const setBlockStyle = useCallback(
    async (nodeId: string, style: TextBlockStyle) => {
      const data = rf.getNode(nodeId)?.data.object.data ?? {}
      if ((data.style === 'framed' ? 'framed' : 'plain') === style) return
      await patchData(nodeId, { ...data, style }, style === 'framed' ? t('undo.addFrame') : t('undo.removeFrame'))
    },
    [rf, patchData]
  )

  const currentTextSize = useCallback((n: ObjectNode): number => {
    const raw = Number(n.data.object.data.fontSize)
    return Number.isFinite(raw) && raw > 0 ? raw : BLOCK_DEFAULT_SIZE
  }, [])

  /**
   * Change the font size of every text box / card in `nodes` (`sizeFor` picks the next px from the current size).
   * Text boxes auto-grow their height from their content, so only the data changes.
   */
  const applyTextSize = useCallback(
    async (nodes: ObjectNode[], sizeFor: (current: number) => number) => {
      const before: ObjectPatch[] = []
      const after: ObjectPatch[] = []
      for (const n of nodes) {
        if (n.type !== 'card') continue
        const current = currentTextSize(n)
        const next = sizeFor(current)
        if (next === current) continue
        const o = n.data.object
        if (n.data.card?.kind === 'block') {
          before.push({ id: n.id, data: o.data })
          after.push({ id: n.id, data: { ...o.data, fontSize: next } })
        } else {
          // regular card: its content is zoomed (CardNode), so the box scales along — "smaller text = smaller card"
          const w = n.width ?? o.width
          const h = n.height ?? o.height
          const r = next / current
          before.push({ id: n.id, data: o.data, width: w, height: h })
          after.push({ id: n.id, data: { ...o.data, fontSize: next }, width: Math.max(120, Math.round(w * r)), height: Math.max(60, Math.round(h * r)) })
        }
      }
      if (!before.length) return
      await applyOp({ type: 'patch', before, after })
      record({ label: t('undo.textSize'), undo: () => applyOp({ type: 'patch', before: after, after: before }), redo: () => applyOp({ type: 'patch', before, after }) })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentTextSize]
  )

  const setTextSizePreset = useCallback((nodes: ObjectNode[], preset: TextSizePreset) => applyTextSize(nodes, () => TEXT_SIZE_PX[preset]), [applyTextSize])
  const stepTextSize = useCallback((nodes: ObjectNode[], dir: 1 | -1) => applyTextSize(nodes, (current) => steppedSize(current, dir)), [applyTextSize])

  const unlinkChart = useCallback(
    async (nodeId: string) => {
      const { source: _source, ...rest } = rf.getNode(nodeId)?.data.object.data ?? {}
      await patchData(nodeId, rest, t('undo.unlinkChart'))
    },
    [rf, patchData]
  )

  /** A text block becomes a regular card (shows up in the library, full card look). */
  const convertToCard = useCallback(
    async (cardId: string) => {
      const set = async (kind: 'card' | 'block') => {
        await window.api.updateCard({ id: cardId, kind })
        dispatch(api.util.invalidateTags([{ type: 'Whiteboard', id: boardId }, 'CardList', { type: 'Card', id: cardId }]))
      }
      await set('card')
      record({ label: t('undo.convertToCard'), undo: () => set('block'), redo: () => set('card') })
      toast.success(t('canvas.converted'), { action: { label: t('common.open'), onClick: () => dispatch(openCard(cardId)) } })
    },
    [dispatch, boardId]
  )

  const insertChartFromTable = useCallback(
    async (tableId: string) => {
      const res = await chartFromTable({ whiteboardId: boardId, tableId })
      if (!('data' in res) || !res.data) return void toast.error(t('canvas.chartFailed'))
      autoSelect.current = res.data.id
      track({ type: 'add', objects: [res.data], connections: [] })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chartFromTable, boardId]
  )

  late.current = { convertToCard, setBlockStyle, insertChartFromTable, unlinkChart, setTextSizePreset }

  const importAt = useCallback(
    async (pos: { x: number; y: number }) => {
      const files = await window.api.importFiles()
      for (const [i, f] of files.entries())
        await place('file', { x: pos.x - 160 + i * 40, y: pos.y - 200 + i * 40 }, { refId: f.id, data: { name: f.name, mime: f.mime } })
      if (files.length) toast.success(t('canvas.imported', { count: files.length }))
    },
    [place]
  )

  const changeTool = useCallback(
    async (next: CanvasTool) => {
      if (next === 'import') {
        dispatch(setTool('select'))
        await importAt(center())
        return
      }
      if (next === 'search') {
        dispatch(setTool('select'))
        insertPos.current = null
        setSearchOpen(true)
        return
      }
      dispatch(setTool(next))
    },
    [dispatch, center, importAt]
  )

  const applyOp = useCallback(
    async (op: HistoryOp) => {
      if (op.type === 'patch') {
        await window.api.updateObjects(op.after)
        const byId = new Map(op.after.map((p) => [p.id, p]))
        setNodes((ns) =>
          ns.map((n) => {
            const p = byId.get(n.id)
            if (!p) return n
            return {
              ...n,
              position: { x: p.x ?? n.position.x, y: p.y ?? n.position.y },
              width: p.width ?? n.width,
              height: p.height ?? n.height,
              data: { ...n.data, object: { ...n.data.object, ...p, data: p.data ?? n.data.object.data } }
            }
          })
        )
      } else if (op.type === 'add') {
        await window.api.restoreObjects(op.objects, op.connections)
      } else {
        await window.api.removeObjects(op.objects.map((o) => o.id))
        await window.api.removeConnections(op.connections.map((c) => c.id))
      }
      dispatch(api.util.invalidateTags([{ type: 'Whiteboard', id: boardId }, 'Card']))
    },
    [dispatch, boardId]
  )

  // copy / paste / duplicate selected objects (cards are referenced, not cloned)
  const clipboard = useRef<{ objects: ObjectNode['data']['object'][] } | null>(null)
  const pasteObjects = useCallback(
    async (objects: ObjectNode['data']['object'][], offset: { x: number; y: number }) => {
      const created = []
      const blocks: string[] = []
      for (const o of objects) {
        // text blocks belong to one spot: a copy gets its own block card
        let refId = o.refId
        if (o.kind === 'card' && isBlock(o.refId)) {
          const src = await window.api.getCard(o.refId!)
          if (src) {
            refId = (await window.api.createCard({ kind: 'block', content: src.content })).id
            blocks.push(refId)
          }
        }
        const res = await addObject({
          whiteboardId: boardId,
          kind: o.kind,
          refId,
          x: o.x + offset.x,
          y: o.y + offset.y,
          width: o.width,
          height: o.height,
          color: o.color,
          data: o.data
        })
        if ('data' in res && res.data) created.push(res.data)
      }
      if (created.length) trackBlocks({ type: 'add', objects: created, connections: [] }, blocks)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [addObject, boardId]
  )

  const selectedObjects = () => rf.getNodes().filter((n) => n.selected).map((n) => ({ ...n.data.object, x: n.position.x, y: n.position.y }))

  const pasteAt = useCallback(
    async (pos: { x: number; y: number }) => {
      if (clipboard.current) {
        const objs = clipboard.current.objects
        const minX = Math.min(...objs.map((o) => o.x))
        const minY = Math.min(...objs.map((o) => o.y))
        await pasteObjects(objs, { x: pos.x - minX - 100, y: pos.y - minY - 100 })
        return
      }
      // Nothing copied on the canvas — if the system clipboard holds a URL, drop a link card in.
      let text = ''
      try {
        text = await navigator.clipboard.readText()
      } catch {
        return
      }
      const url = firstUrl(text)
      if (!url) return
      await place('link', { x: pos.x - 160, y: pos.y - 100 }, { data: { url } })
    },
    [pasteObjects, place]
  )

  const selectAll = useCallback(() => setNodes((ns) => ns.map((n) => ({ ...n, selected: true }))), [])

  /** A drawing from the iPad companion: a native Excalidraw sketch at the viewport centre (undoable like any insert). */
  const insertDrawing = useCallback(
    async (drawing: DrawSubmission) => {
      try {
        const { buildSketchData } = await import('@/features/draw/toExcalidraw')
        // iPad drawings land frameless: ink straight on the board
        const data = { ...(await buildSketchData(drawing)), frameless: true }
        const size = framelessSize(data.elements)
        const c = center()
        const o = await place('sketch', { x: c.x - size.width / 2, y: c.y - size.height / 2 }, { data, ...size })
        if (!o) return
        autoSelect.current = o.id
        setNodes((ns) => (ns.some((n) => n.id === o.id) ? ns.map((n) => ({ ...n, selected: n.id === o.id })) : ns))
        toast.success(t('canvas.drawingAdded'), { description: t('canvas.drawingAddedHint') })
      } catch (e) {
        console.error('[sidera-draw] could not insert drawing', e)
        toast.error(t('canvas.drawingFailed'))
      }
    },
    [center, place]
  )

  useCommands({
    'canvas.copy': () => {
      const selected = selectedObjects()
      if (!selected.length) return false
      clipboard.current = { objects: selected }
    },
    'canvas.duplicate': () => {
      const selected = selectedObjects()
      if (selected.length) void pasteObjects(selected, { x: 40, y: 40 })
    },
    'canvas.paste': () => void pasteAt(center()),
    'canvas.selectAll': () => selectAll(),
    'canvas.group': () => {
      if (rf.getNodes().filter((n) => n.selected).length < 2) return false
      void groupSelection()
    },
    'canvas.fit': () => void rf.fitView({ duration: 300, padding: 0.15 }),
    'canvas.drawOnIpad': () => setDrawOpen(true),
    'canvas.textBigger': () => {
      const sel = rf.getNodes().filter((n) => n.selected)
      if (!sel.length) return false
      void stepTextSize(sel, 1)
    },
    'canvas.textSmaller': () => {
      const sel = rf.getNodes().filter((n) => n.selected)
      if (!sel.length) return false
      void stepTextSize(sel, -1)
    },
    'canvas.newTextBlock': () => void newTextBlockAt(pointer.current ? rf.screenToFlowPosition(pointer.current) : center()),
    ...Object.fromEntries(TOOLS.map((tool) => [`tool.${tool.id}`, () => void changeTool(tool.id)]))
  })

  // Esc always returns to the select tool
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && dispatch(setTool('select'))
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dispatch])

  const onNodesChange = useCallback((changes: NodeChange<ObjectNode>[]) => {
    setNodes((ns) => applyNodeChanges(changes, ns))
    const patches: ObjectPatch[] = []
    for (const c of changes) {
      if (c.type !== 'dimensions' || !c.dimensions) continue
      const n = rf.getNode(c.id)
      if (c.resizing && n && !resizeBefore.current.has(c.id))
        resizeBefore.current.set(c.id, {
          id: c.id,
          x: n.position.x,
          y: n.position.y,
          width: n.width ?? n.measured?.width,
          height: n.height ?? n.measured?.height,
          ...(isBlock(n.data.object.refId) ? { data: n.data.object.data } : {})
        })
      if (c.resizing === false) {
        // a manual resize pins the height (cards grow with their content, image nodes hug their picture)
        const o = n?.data.object
        const start = resizeBefore.current.get(c.id)
        const pin =
          o && (o.kind === 'card' || o.kind === 'file') && !isBlock(o.refId) && o.data?.autoSize !== false
            ? { data: { ...(o.data ?? {}), autoSize: false } }
            : // a text box resized from a corner keeps that height as its minimum (it still grows with its text)
              o && isBlock(o.refId) && start?.data
              ? { data: { ...o.data, minHeight: Math.abs((start.height ?? 0) - c.dimensions.height) >= 1 ? Math.round(c.dimensions.height) : o.data.minHeight } }
              : {}
        patches.push({ id: c.id, width: c.dimensions.width, height: c.dimensions.height, ...(n ? { x: n.position.x, y: n.position.y } : {}), ...pin })
      }
    }
    if (patches.length) {
      const withData = new Map(patches.filter((p) => p.data).map((p) => [p.id, p.data!]))
      if (withData.size)
        setNodes((ns) => ns.map((n) => (withData.has(n.id) ? { ...n, data: { ...n.data, object: { ...n.data.object, data: withData.get(n.id)! } } } : n)))
      const before = patches.map((p) => resizeBefore.current.get(p.id)).filter((p): p is ObjectPatch => !!p)
      if (before.length === patches.length) track({ type: 'patch', before, after: patches })
      patches.forEach((p) => resizeBefore.current.delete(p.id))
    }
    persist(patches)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rf])

  const onEdgesChange = useCallback((changes: EdgeChange<ConnectionEdge>[]) => setEdges((es) => applyEdgeChanges(changes, es)), [])

  const onNodeDragStart: OnNodeDrag<ObjectNode> = useCallback((_e, node, dragged) => {
    dragBefore.current = dragged.map((n) => ({ id: n.id, x: n.position.x, y: n.position.y }))
    sectionDrag.current = null
    if (node.type !== 'section') return
    const w = node.measured?.width ?? node.width ?? 0
    const h = node.measured?.height ?? node.height ?? 0
    const children = new Map<string, { x: number; y: number }>()
    for (const n of rf.getNodes()) {
      if (n.id === node.id || n.selected) continue
      const nw = n.measured?.width ?? n.width ?? 0
      const nh = n.measured?.height ?? n.height ?? 0
      if (n.position.x >= node.position.x && n.position.y >= node.position.y && n.position.x + nw <= node.position.x + w && n.position.y + nh <= node.position.y + h)
        children.set(n.id, { ...n.position })
    }
    sectionDrag.current = { start: { ...node.position }, children }
    children.forEach((p, id) => dragBefore.current.push({ id, x: p.x, y: p.y }))
  }, [rf])

  const onNodeDrag: OnNodeDrag<ObjectNode> = useCallback((_e, node) => {
    const sd = sectionDrag.current
    if (!sd || node.type !== 'section') return
    const dx = node.position.x - sd.start.x
    const dy = node.position.y - sd.start.y
    setNodes((ns) => ns.map((n) => {
      const p = sd.children.get(n.id)
      return p ? { ...n, position: { x: p.x + dx, y: p.y + dy } } : n
    }))
  }, [])

  const onNodeDragStop: OnNodeDrag<ObjectNode> = useCallback((_e, _node, dragged) => {
    const moved = new Set(dragged.map((n) => n.id))
    sectionDrag.current?.children.forEach((_p, id) => moved.add(id))
    sectionDrag.current = null
    const patches = rf.getNodes().filter((n) => moved.has(n.id)).map((n) => ({ id: n.id, x: n.position.x, y: n.position.y }))
    track({ type: 'patch', before: dragBefore.current, after: patches })
    persist(patches)
  }, [rf])

  const connect = useCallback(
    async (source: string, target: string) => {
      if (source === target) return
      if (edges.some((e) => e.source === source && e.target === target)) return
      const res = await addConnection({ whiteboardId: boardId, sourceId: source, targetId: target })
      if ('data' in res && res.data) track({ type: 'add', objects: [], connections: [res.data] })
    },
    [addConnection, boardId, edges]
  )

  const onConnect = useCallback((c: RFConnection) => void connect(c.source, c.target), [connect])

  const onPaneClick = useCallback(
    async (e: React.MouseEvent) => {
      connectFrom.current = null
      const pos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })
      if (tool === 'text') {
        dispatch(setTool('select'))
        await newTextBlockAt(pos)
      } else if (tool === 'card') {
        dispatch(setTool('select'))
        await newCardAt(pos)
      } else if (tool === 'section') {
        dispatch(setTool('select'))
        await place('section', { x: pos.x, y: pos.y }, { color: 'blue', data: { title: t('canvas.section') } })
      }
    },
    [rf, tool, dispatch, newCardAt, newTextBlockAt, place]
  )

  const onNodeClick = useCallback(
    (_e: React.MouseEvent, node: ObjectNode) => {
      if (tool !== 'connector') return
      if (!connectFrom.current) {
        connectFrom.current = node.id
        toast(t('canvas.clickTarget'), { duration: 1500 })
      } else {
        void connect(connectFrom.current, node.id)
        connectFrom.current = null
      }
    },
    [tool, connect]
  )

  const onAction = useCallback(
    async (a: CanvasAction, at?: { x: number; y: number }) => {
      const c = at ?? center()
      if (a === 'fit') return void rf.fitView({ duration: 300, padding: 0.15 })
      if (a === 'paste') return void pasteAt(c)
      if (a === 'select-all') return selectAll()
      if (a === 'text') return void newTextBlockAt(c)
      if (a === 'table') {
        const o = await place('table', { x: c.x - 210, y: c.y - 80 }, { data: localizeSample(emptyTable()) as unknown as Record<string, unknown>, width: 420 })
        if (o) autoSelect.current = o.id
        return
      }
      if (a === 'card') return void newCardAt(c)
      if (a === 'existing-card') {
        insertPos.current = c
        return setSearchOpen(true)
      }
      if (a === 'section') return void place('section', { x: c.x, y: c.y }, { color: 'blue', data: { title: t('canvas.section') } })
      if (a === 'connector') return void dispatch(setTool('connector'))
      if (a === 'import') return void importAt(c)
      if (a.startsWith('chart:')) {
        const type = a.slice(6) as ChartType
        const o = await place('chart', { x: c.x - 220, y: c.y - 150 }, { data: localizeSample(defaultChart(type)) as unknown as Record<string, unknown> })
        if (o) autoEdit.current = o.id
        return
      }
      if (a.startsWith('shape:')) {
        const kind = a.slice(6) as ShapeKind
        const { elements, width, height } = buildShape(kind)
        const o = await place(
          'sketch',
          { x: c.x - width / 2, y: c.y - height / 2 },
          { data: { elements, files: {}, frameless: true }, width, height }
        )
        if (o) autoSelect.current = o.id
        return
      }
      if (a === 'sketch') {
        const o = await place('sketch', { x: c.x - 190, y: c.y - 140 }, { data: {} })
        if (o) setSketchId(o.id)
        return
      }
      if (a === 'draw-ipad') return setDrawOpen(true)
      if (a === 'mindmap') {
        const o = await place('mindmap', { x: c.x - 240, y: c.y - 160 }, { data: {} })
        if (o) autoEdit.current = o.id
        return
      }
      if (a === 'mermaid') {
        const o = await place('mermaid', { x: c.x - 210, y: c.y - 150 }, { data: {} })
        if (o) autoEdit.current = o.id
        return
      }
      if (a === 'link') {
        insertPos.current = c
        setLinkUrl('')
        setLinkDialog(true)
        return
      }
      if (a === 'whiteboard') {
        const res = await createWhiteboard({ name: t('board.untitled'), parentId: boardId })
        if ('data' in res && res.data) await place('whiteboard', { x: c.x - 130, y: c.y - 70 }, { refId: res.data.id })
        return
      }
      if (a === 'properties') {
        setPropertiesOpen(true)
        return
      }
      if (a === 'organize') {
        const hasKey = await window.chat.hasKey()
        if (!hasKey) {
          toast(t('board.organizeNoKey'), { description: t('board.organizeNoKeyHint') })
          return
        }
        dispatch(queueChatMessage(t('board.organizePrompt', { name: detail.whiteboard.name, id: boardId })))
        return
      }
      if (a === 'autolayout') {
        const g = new dagre.graphlib.Graph()
        g.setGraph({ rankdir: 'LR', nodesep: 40, ranksep: 80 })
        g.setDefaultEdgeLabel(() => ({}))
        const linked = new Set(edges.flatMap((e) => [e.source, e.target]))
        const targets = nodes.filter((n) => linked.has(n.id) && n.type !== 'section')
        if (!targets.length) return void toast(t('canvas.connectFirst'))
        for (const n of targets) g.setNode(n.id, { width: n.measured?.width ?? n.width ?? 300, height: n.measured?.height ?? n.height ?? 200 })
        for (const e of edges) g.setEdge(e.source, e.target)
        dagre.layout(g)
        const minX = Math.min(...targets.map((n) => n.position.x))
        const minY = Math.min(...targets.map((n) => n.position.y))
        const patches: ObjectPatch[] = targets.map((n) => {
          const p = g.node(n.id)
          return { id: n.id, x: minX + p.x - p.width / 2, y: minY + p.y - p.height / 2 }
        })
        const byId = new Map(patches.map((p) => [p.id, p]))
        setNodes((ns) => ns.map((n) => (byId.has(n.id) ? { ...n, position: { x: byId.get(n.id)!.x!, y: byId.get(n.id)!.y! } } : n)))
        persist(patches)
        setTimeout(() => rf.fitView({ duration: 400, padding: 0.15 }), 50)
      }
    },
    [center, rf, place, createWhiteboard, boardId, edges, nodes, dispatch, detail.whiteboard.name, pasteAt, selectAll, newCardAt, newTextBlockAt, importAt]
  )

  // "New text block" / "New table" from the command palette
  const onActionRef = useRef(onAction)
  onActionRef.current = onAction
  useEffect(() => {
    const onEvent = (e: Event) => void onActionRef.current((e as CustomEvent<CanvasAction>).detail)
    window.addEventListener(CANVAS_ACTION_EVENT, onEvent)
    return () => window.removeEventListener(CANVAS_ACTION_EVENT, onEvent)
  }, [])

  // ---- selection toolbar -------------------------------------------------
  const selectedNodes = useMemo(() => nodes.filter((n) => n.selected), [nodes])
  const nodeBox = (n: ObjectNode) => ({
    id: n.id,
    x: n.position.x,
    y: n.position.y,
    width: n.measured?.width ?? n.width ?? 300,
    height: n.measured?.height ?? n.height ?? 180
  })

  /** Cards carry their colour on the card, everything else on the whiteboard object. */
  const applyColors = useCallback(
    async (cards: { id: string; color: string | null }[], objects: ObjectPatch[]) => {
      for (const c of cards) await window.api.updateCard({ id: c.id, color: c.color })
      if (objects.length) await window.api.updateObjects(objects)
      dispatch(api.util.invalidateTags([{ type: 'Whiteboard', id: boardId }, 'Card', 'CardList']))
    },
    [dispatch, boardId]
  )

  const colorSelection = useCallback(
    async (col: string | null) => {
      const sel = rf.getNodes().filter((n) => n.selected)
      const cardNodes = sel.filter((n) => n.type === 'card' && n.data.object.refId)
      const objNodes = sel.filter((n) => n.type !== 'card')
      if (!cardNodes.length && !objNodes.length) return
      const beforeCards = cardNodes.map((n) => ({ id: n.data.object.refId!, color: n.data.card?.color ?? null }))
      const afterCards = cardNodes.map((n) => ({ id: n.data.object.refId!, color: col }))
      const beforeObjs: ObjectPatch[] = objNodes.map((n) => ({ id: n.id, color: n.data.object.color }))
      const afterObjs: ObjectPatch[] = objNodes.map((n) => ({ id: n.id, color: col }))
      await applyColors(afterCards, afterObjs)
      record({
        label: t('undo.changeColor'),
        undo: () => void applyColors(beforeCards, beforeObjs),
        redo: () => void applyColors(afterCards, afterObjs)
      })
    },
    [rf, applyColors]
  )

  const arrangeSelection = useCallback(
    (mode: ArrangeMode) => {
      const sel = rf.getNodes().filter((n) => n.selected)
      const moved = arrange(sel.map(nodeBox), mode)
      if (!moved.length) return
      const before: ObjectPatch[] = moved.map((p) => {
        const n = rf.getNode(p.id)!
        return { id: p.id, x: n.position.x, y: n.position.y }
      })
      const after: ObjectPatch[] = moved.map((p) => ({ id: p.id, x: p.x, y: p.y }))
      const byId = new Map(moved.map((p) => [p.id, p]))
      setNodes((ns) => ns.map((n) => (byId.has(n.id) ? { ...n, position: { x: byId.get(n.id)!.x, y: byId.get(n.id)!.y } } : n)))
      persist(after)
      track({ type: 'patch', before, after })
    },
    [rf]
  )

  /** Wrap the selection in a section that sits behind it. */
  const groupSelection = useCallback(async () => {
    const sel = rf.getNodes().filter((n) => n.selected)
    if (sel.length < 2) return
    const b = bounds(sel.map(nodeBox))
    const pad = 40
    await place('section', { x: b.x - pad, y: b.y - pad - 8 }, { color: 'blue', width: b.width + pad * 2, height: b.height + pad * 2 + 8, data: { title: t('canvas.section') } })
  }, [rf, place])

  const selectionActions = useMemo(
    () => ({
      color: (c: string | null) => void colorSelection(c),
      arrange: arrangeSelection,
      group: () => void groupSelection(),
      copy: () => {
        clipboard.current = { objects: selectedObjects() }
        toast(t('common.copied'), { duration: 1200 })
      },
      duplicate: () => void pasteObjects(selectedObjects(), { x: 40, y: 40 }),
      remove: () => void rf.deleteElements({ nodes: rf.getNodes().filter((n) => n.selected).map((n) => ({ id: n.id })) }),
      open: (node: ObjectNode) => {
        const o = node.data.object
        if (!o.refId) return
        dispatch(node.type === 'whiteboard' ? navigate({ type: 'whiteboard', id: o.refId }) : openCard(o.refId))
      },
      openInNewTab: (node: ObjectNode) => {
        const o = node.data.object
        if (o.refId && node.type === 'whiteboard') dispatch(openTab({ type: 'whiteboard', id: o.refId }))
      },
      blockStyle: (node: ObjectNode, style: TextBlockStyle) => void setBlockStyle(node.id, style),
      chartFromTable: (node: ObjectNode) => void insertChartFromTable(node.id),
      unlinkChart: (node: ObjectNode) => void unlinkChart(node.id),
      textSizePreset: (preset: TextSizePreset) => void setTextSizePreset(rf.getNodes().filter((n) => n.selected), preset),
      stepTextSize: (dir: 1 | -1) => void stepTextSize(rf.getNodes().filter((n) => n.selected), dir)
    }),
    [colorSelection, arrangeSelection, groupSelection, pasteObjects, rf, dispatch, setBlockStyle, insertChartFromTable, unlinkChart, setTextSizePreset, stepTextSize]
  )

  // ---- connection menu ---------------------------------------------------
  const edgeConnection = useMemo(() => detail.connections.find((c) => c.id === edgeMenu?.id), [detail.connections, edgeMenu])

  /** Apply a connection patch and make it undoable. */
  const patchConnection = useCallback(
    async (id: string, patch: ConnectionPatch) => {
      const before = detail.connections.find((c) => c.id === id)
      if (!before) return
      const apply = async (p: ConnectionPatch): Promise<void> => {
        await window.api.updateConnection({ id, ...p })
        dispatch(api.util.invalidateTags([{ type: 'Whiteboard', id: boardId }]))
      }
      const undoPatch = Object.fromEntries(Object.keys(patch).map((k) => [k, before[k as keyof ConnectionPatch]])) as ConnectionPatch
      await apply(patch)
      record({ label: t('undo.changeConnection'), undo: () => void apply(undoPatch), redo: () => void apply(patch) })
    },
    [detail.connections, dispatch, boardId]
  )

  const viewportTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const onMoveEnd = useCallback(
    (_: unknown, viewport: Viewport) => {
      clearTimeout(viewportTimer.current)
      viewportTimer.current = setTimeout(() => void window.api.updateWhiteboard({ id: boardId, viewport }), 500)
    },
    [boardId]
  )

  const cardIds = useMemo(() => new Set(detail.objects.filter((o) => o.kind === 'card' && o.refId).map((o) => o.refId!)), [detail.objects])
  const hasViewport = detail.whiteboard.viewport.zoom !== 1 || detail.whiteboard.viewport.x !== 0 || detail.whiteboard.viewport.y !== 0

  return (
    <div
      ref={wrapper}
      className={cn('canvas-root relative h-full w-full bg-canvas', `tool-${tool}`)}
      onContextMenu={(e) => e.preventDefault()}
      onPointerMove={(e) => (pointer.current = { x: e.clientX, y: e.clientY })}
      onPointerLeave={() => (pointer.current = null)}
      onPointerDownCapture={(e) => {
        if (e.button !== 2) return
        rightDown.current = { x: e.clientX, y: e.clientY, pane: (e.target as HTMLElement).classList.contains('react-flow__pane') }
      }}
      onPointerUp={(e) => {
        // A right-click opens the canvas menu; a right-drag panned the board instead.
        if (e.button !== 2) return
        const down = rightDown.current
        rightDown.current = null
        if (!down?.pane || Math.hypot(e.clientX - down.x, e.clientY - down.y) > RIGHT_CLICK_SLOP) return
        setPaneMenu({ x: e.clientX, y: e.clientY, flow: rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }) })
      }}
      onDragOver={(e) => {
        if (
          e.dataTransfer.types.includes(CARD_MIME) ||
          e.dataTransfer.types.includes(HIGHLIGHT_MIME) ||
          e.dataTransfer.types.includes('Files') ||
          e.dataTransfer.types.includes('text/uri-list')
        ) {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
        }
      }}
      onDrop={async (e) => {
        const pos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })
        const highlight = readHighlightDrag(e.dataTransfer)
        if (highlight) {
          e.preventDefault()
          const onto = (e.target as HTMLElement).closest('.react-flow__node')?.getAttribute('data-id')
          await dropHighlight(highlight, pos, onto ?? undefined)
          return
        }
        const cardId = e.dataTransfer.getData(CARD_MIME)
        if (cardId) {
          e.preventDefault()
          await place('card', { x: pos.x - 160, y: pos.y - 30 }, { refId: cardId })
          return
        }
        if (!e.dataTransfer.files.length) {
          const url = firstUrl(e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain'))
          if (url) {
            e.preventDefault()
            await place('link', { x: pos.x - 160, y: pos.y - 100 }, { data: { url } })
            return
          }
        }
        const paths = [...e.dataTransfer.files].map((f) => window.files.pathFor(f)).filter(Boolean)
        if (!paths.length) return
        e.preventDefault()
        const files = await window.api.importFiles(paths)
        for (const [i, f] of files.entries())
          await place('file', { x: pos.x + i * 40, y: pos.y + i * 40 }, { refId: f.id, data: { name: f.name, mime: f.mime } })
        if (!files.length) toast.error(t('canvas.unsupportedFile'))
      }}
    >
      <ReactFlow<ObjectNode, ConnectionEdge>
        proOptions={{ hideAttribution: true }}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onDelete={({ nodes: ns, edges: es }) => {
          const objects = ns.map((n) => n.data.object)
          const connections = detail.connections.filter((c) => es.some((e) => e.id === c.id))
          const blocks = objects.filter((o) => o.kind === 'card' && isBlock(o.refId)).map((o) => o.refId!)
          if (objects.length || connections.length) trackBlocks({ type: 'remove', objects, connections }, blocks)
          for (const c of blocks) void window.api.deleteCard(c)
          if (objects.length) void removeObjects({ whiteboardId: boardId, ids: objects.map((o) => o.id) })
          const loose = connections.filter((c) => !objects.some((o) => o.id === c.sourceId || o.id === c.targetId))
          if (loose.length) void removeConnections({ whiteboardId: boardId, ids: loose.map((c) => c.id) })
        }}
        onConnect={onConnect}
        onPaneClick={onPaneClick}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={(_e, node) => {
          const o = node.data.object
          if (node.type === 'file' && o.refId) openFileObject(o.refId, String(o.data.name ?? t('canvas.file')), String(o.data.mime ?? ''))
        }}
        onEdgeClick={(e, edge) => {
          const r = wrapper.current!.getBoundingClientRect()
          setEdgeMenu({ id: edge.id, x: e.clientX - r.left, y: e.clientY - r.top + 14 })
        }}
        onNodeContextMenu={(e, node) => {
          e.preventDefault()
          setMenu({ node, x: e.clientX, y: e.clientY })
        }}
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).classList.contains('react-flow__pane')) void newTextBlockAt(rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }))
        }}
        onMoveEnd={onMoveEnd}
        defaultViewport={detail.whiteboard.viewport}
        fitView={!hasViewport && nodes.length > 0}
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
        connectionMode={ConnectionMode.Loose}
        snapToGrid={snapToGrid}
        snapGrid={[22, 22]}
        nodesDraggable={tool !== 'connector' && tool !== 'pen'}
        elementsSelectable={tool !== 'pen'}
        panOnScroll
        zoomOnDoubleClick={false}
        selectionOnDrag={tool === 'select'}
        panOnDrag={tool === 'select' || tool === 'pen' ? [1, 2] : true}
        minZoom={0.05}
        maxZoom={4}
        deleteKeyCode={['Backspace', 'Delete']}
        multiSelectionKeyCode="Shift"
        attributionPosition="bottom-left"
        defaultEdgeOptions={{ type: 'floating' }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="var(--canvas-dot)" />
      </ReactFlow>
      {tool === 'pen' && <InkLayer host={wrapper} boardId={boardId} />}
      <CanvasToolbar tool={tool} onTool={(t) => void changeTool(t)} onAction={(a) => void onAction(a)} />
      <ZoomControls />
      <CardDrawer onBoard={cardIds} />
      <BoardBreadcrumb id={boardId} />
      {edgeMenu && edgeConnection && (
        <EdgeMenu
          connection={edgeConnection}
          x={edgeMenu.x}
          y={edgeMenu.y}
          onChange={(patch) => void patchConnection(edgeMenu.id, patch)}
          onDelete={() => {
            setEdgeMenu(null)
            void rf.deleteElements({ edges: [{ id: edgeMenu.id }] })
          }}
          onClose={() => setEdgeMenu(null)}
        />
      )}
      <SelectionToolbar selected={selectedNodes} actions={selectionActions} />
      <CanvasContextMenu
        at={paneMenu}
        onClose={() => setPaneMenu(null)}
        onAction={(a) => {
          const at = paneMenu?.flow
          setPaneMenu(null)
          void onAction(a, at)
        }}
      />
      <FindOnBoard />
      {propertiesOpen && <WhiteboardPropertiesDialog whiteboardId={boardId} onClose={() => setPropertiesOpen(false)} />}
      {sketchId && (
        <Suspense fallback={null}>
          <SketchEditor
            initial={(nodes.find((n) => n.id === sketchId)?.data.object.data ?? {}) as { elements?: unknown[]; files?: Record<string, unknown> }}
            onClose={() => setSketchId(null)}
            onSave={async (saved) => {
              const id = sketchId
              setSketchId(null)
              const node = nodes.find((n) => n.id === id)
              if (!node) return
              // keep flags like `frameless`; a stale dark preview must not survive an edit that removed the photos
              const { svgDark: _old, ...prev } = node.data.object.data
              void _old
              const data = { ...prev, ...saved }
              const patch: ObjectPatch = { id, data }
              // frameless ink keeps its scale: added / removed strokes grow or shrink the box around what stays put
              const oldB = inkBounds(prev.elements as unknown[] | undefined)
              const newB = inkBounds(saved.elements)
              if (isFrameless(prev) && oldB && newB) {
                const box = { x: node.position.x, y: node.position.y, width: node.width ?? node.data.object.width, height: node.height ?? node.data.object.height }
                Object.assign(patch, reboxed(fitTransform(oldB, box), newB))
              }
              await window.api.updateObjects([patch])
              setNodes((ns) =>
                ns.map((n) =>
                  n.id === id
                    ? {
                        ...n,
                        position: { x: patch.x ?? n.position.x, y: patch.y ?? n.position.y },
                        width: patch.width ?? n.width,
                        height: patch.height ?? n.height,
                        data: { ...n.data, object: { ...n.data.object, ...patch, data } }
                      }
                    : n
                )
              )
              dispatch(api.util.invalidateTags([{ type: 'Whiteboard', id: boardId }]))
            }}
          />
        </Suspense>
      )}
      <DrawOnIpadDialog open={drawOpen} whiteboardId={boardId} onOpenChange={setDrawOpen} onReceived={insertDrawing} />
      <FileViewer
        file={viewing}
        onClose={() => setViewing(null)}
        onHighlight={async (text, page) => {
          if (!viewing) return
          const quote = text.replace(/\s+/g, ' ')
          const title = quote.length > 60 ? quote.slice(0, 57).trimEnd() + '…' : quote
          const res = await createCard({ title, markdown: `> ${quote}\n\nSource: *${viewing.name}*${page ? `, page ${page}` : ''}` })
          if (!('data' in res) || !res.data) return
          const fileNode = nodes.find((n) => n.data.object.refId === viewing.refId)
          const siblings = nodes.filter((n) => n.type === 'card')
          const x = fileNode ? fileNode.position.x + (fileNode.width ?? 320) + 60 : center().x
          const y = fileNode ? fileNode.position.y + siblings.filter((n) => n.position.x >= x - 10).length * 40 : center().y
          const o = await place('card', { x, y }, { refId: res.data.id, width: 300, height: 180 })
          if (o && fileNode) {
            const conn = await addConnection({ whiteboardId: boardId, sourceId: fileNode.id, targetId: o.id })
            if ('data' in conn && conn.data) track({ type: 'add', objects: [], connections: [conn.data] })
          }
          toast.success(t('pdf.cardCreated'))
        }}
      />
      <NodeMenu menu={menu} onClose={() => setMenu(null)} onAction={(a, n) => void onMenuAction(a, n)} />
      {nodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="text-center text-sm text-muted-foreground">
            <p className="font-medium text-foreground">{t('canvas.empty')}</p>
            <p className="mt-1">
              {t('canvas.emptyBefore')}
              <kbd className="rounded border px-1">F</kbd>
              {t('canvas.emptyAfter')}
            </p>
          </div>
        </div>
      )}
      <AddCardDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        excludeIds={cardIds}
        onPick={async (cardId) => {
          setSearchOpen(false)
          const c = insertPos.current ?? center()
          await place('card', { x: c.x - 160, y: c.y - 110 }, { refId: cardId })
        }}
        onCreate={async (title) => {
          setSearchOpen(false)
          await newCardAt(insertPos.current ?? center(), title)
        }}
      />
      <Dialog open={linkDialog} onOpenChange={setLinkDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('canvas.addLink')}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              const raw = linkUrl.trim()
              if (!raw) return
              const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
              setLinkDialog(false)
              const c = insertPos.current ?? center()
              await place('link', { x: c.x - 160, y: c.y - 100 }, { data: { url } })
            }}
          >
            <Input autoFocus placeholder="https://example.com" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
            <DialogFooter className="mt-4">
              <Button type="submit">{t('common.add')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}


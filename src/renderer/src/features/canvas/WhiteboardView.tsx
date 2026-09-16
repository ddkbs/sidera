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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { ObjectKind, ObjectPatch, WhiteboardDetail } from '@shared/types'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store'
import {
  api,
  useAddConnectionMutation,
  useAddObjectMutation,
  useCreateCardMutation,
  useCreateWhiteboardMutation,
  useDeleteCardMutation,
  useGetWhiteboardQuery,
  useRemoveConnectionsMutation,
  useRemoveObjectsMutation
} from '@/store/api'
import { navigate, openCard, setTool, type CanvasTool } from '@/store/ui'
import { AddCardDialog } from './AddCardDialog'
import { CARD_MIME, CardDrawer } from './CardDrawer'
import { FileViewer } from './FileViewer'
import { FindOnBoard } from './FindOnBoard'
import { History, invert, type HistoryOp } from './history'
import { CanvasToolbar, TOOLS, type OverflowAction } from './CanvasToolbar'
import { edgeTypes } from './FloatingEdge'
import { NodeMenu, type NodeMenuAction } from './NodeMenu'
import { nodeTypes } from './nodes'
import { persist, type ConnectionEdge, type ObjectNode } from './types'
import { ZoomControls } from './ZoomControls'
import './canvas.css'

export function WhiteboardView({ id }: { id: string }) {
  const { data, isLoading, isError } = useGetWhiteboardQuery(id)
  if (isLoading) return <Skeleton className="m-6 h-[calc(100%-3rem)] rounded-xl" />
  if (isError || !data) return <div className="grid h-full place-items-center text-sm text-muted-foreground">Whiteboard not found</div>
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

const toEdges = (d: WhiteboardDetail, prev: ConnectionEdge[] = []): ConnectionEdge[] => {
  const sel = new Set(prev.filter((e) => e.selected).map((e) => e.id))
  return d.connections.map((c) => ({
    id: c.id,
    source: c.sourceId,
    target: c.targetId,
    type: 'floating',
    label: c.label || undefined,
    selected: sel.has(c.id),
    markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
    data: { label: c.label }
  }))
}

function Canvas({ detail }: { detail: WhiteboardDetail }) {
  const boardId = detail.whiteboard.id
  const dispatch = useAppDispatch()
  const tool = useAppSelector((s) => s.ui.tool)
  const rf = useReactFlow<ObjectNode, ConnectionEdge>()
  const [nodes, setNodes] = useState<ObjectNode[]>(() => toNodes(detail))
  const [edges, setEdges] = useState<ConnectionEdge[]>(() => toEdges(detail))
  const [searchOpen, setSearchOpen] = useState(false)
  const autoEdit = useRef<string | undefined>(undefined)
  const connectFrom = useRef<string | null>(null)
  const sectionDrag = useRef<{ start: { x: number; y: number }; children: Map<string, { x: number; y: number }> } | null>(null)
  const wrapper = useRef<HTMLDivElement>(null)
  const history = useRef(new History())
  const dragBefore = useRef<ObjectPatch[]>([])
  const resizeBefore = useRef(new Map<string, ObjectPatch>())

  const [addObject] = useAddObjectMutation()
  const [removeObjects] = useRemoveObjectsMutation()
  const [addConnection] = useAddConnectionMutation()
  const [removeConnections] = useRemoveConnectionsMutation()
  const [createCard] = useCreateCardMutation()
  const [createWhiteboard] = useCreateWhiteboardMutation()
  const [deleteCard] = useDeleteCardMutation()
  const [viewing, setViewing] = useState<{ refId: string; name: string; mime: string } | null>(null)
  const [edgeEdit, setEdgeEdit] = useState<{ id: string; x: number; y: number; label: string } | null>(null)
  const [menu, setMenu] = useState<{ node: ObjectNode; x: number; y: number } | null>(null)

  const onMenuAction = useCallback(
    async (a: NodeMenuAction, node: ObjectNode) => {
      setMenu(null)
      const o = node.data.object
      if (a === 'open' && o.refId) dispatch(node.type === 'whiteboard' ? navigate({ type: 'whiteboard', id: o.refId }) : openCard(o.refId))
      else if (a === 'remove') void rf.deleteElements({ nodes: [{ id: node.id }] })
      else if (a === 'delete-card' && o.refId) {
        await deleteCard(o.refId)
        toast('Card deleted')
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
    [dispatch, rf, deleteCard]
  )

  useEffect(() => {
    setNodes((prev) => toNodes(detail, prev, autoEdit.current))
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
      if ('error' in res) toast.error('Could not add to whiteboard')
      if ('data' in res && res.data) history.current.push({ type: 'add', objects: [res.data], connections: [] })
      return 'data' in res ? res.data : undefined
    },
    [addObject, boardId]
  )

  const newCardAt = useCallback(
    async (pos: { x: number; y: number }, title = '') => {
      const res = await createCard({ title })
      if (!('data' in res) || !res.data) return
      await place('card', { x: pos.x - 160, y: pos.y - 40 }, { refId: res.data.id })
      dispatch(openCard(res.data.id))
    },
    [createCard, place, dispatch]
  )

  const changeTool = useCallback(
    async (t: CanvasTool) => {
      if (t === 'import') {
        dispatch(setTool('select'))
        const files = await window.api.importFiles()
        const c = center()
        for (const [i, f] of files.entries())
          await place('file', { x: c.x - 160 + i * 40, y: c.y - 200 + i * 40 }, { refId: f.id, data: { name: f.name, mime: f.mime } })
        if (files.length) toast.success(`Imported ${files.length} file${files.length > 1 ? 's' : ''}`)
        return
      }
      if (t === 'search') {
        dispatch(setTool('select'))
        setSearchOpen(true)
        return
      }
      dispatch(setTool(t))
    },
    [dispatch, center, place]
  )

  const applyOp = useCallback(
    async (op: HistoryOp) => {
      if (op.type === 'patch') {
        persist(op.after)
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
              data: { ...n.data, object: { ...n.data.object, ...p, data: n.data.object.data } }
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (!e.metaKey || e.key.toLowerCase() !== 'z' || el.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(el.tagName)) return
      e.preventDefault()
      const op = e.shiftKey ? history.current.redo() : history.current.undo()
      if (op) void applyOp(e.shiftKey ? op : invert(op))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [applyOp])

  // copy / paste / duplicate selected objects (cards are referenced, not cloned)
  const clipboard = useRef<{ objects: ObjectNode['data']['object'][] } | null>(null)
  const pasteObjects = useCallback(
    async (objects: ObjectNode['data']['object'][], offset: { x: number; y: number }) => {
      const created = []
      for (const o of objects) {
        const res = await addObject({
          whiteboardId: boardId,
          kind: o.kind,
          refId: o.refId,
          x: o.x + offset.x,
          y: o.y + offset.y,
          width: o.width,
          height: o.height,
          color: o.color,
          data: o.data
        })
        if ('data' in res && res.data) created.push(res.data)
      }
      if (created.length) history.current.push({ type: 'add', objects: created, connections: [] })
    },
    [addObject, boardId]
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (!e.metaKey || el.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(el.tagName)) return
      const selected = rf.getNodes().filter((n) => n.selected).map((n) => ({ ...n.data.object, x: n.position.x, y: n.position.y }))
      const key = e.key.toLowerCase()
      if (key === 'c' && selected.length) clipboard.current = { objects: selected }
      else if (key === 'd' && selected.length) {
        e.preventDefault()
        void pasteObjects(selected, { x: 40, y: 40 })
      } else if (key === 'v' && clipboard.current) {
        e.preventDefault()
        const objs = clipboard.current.objects
        const c = center()
        const minX = Math.min(...objs.map((o) => o.x))
        const minY = Math.min(...objs.map((o) => o.y))
        void pasteObjects(objs, { x: c.x - minX - 100, y: c.y - minY - 100 })
      } else if (key === 'a') {
        e.preventDefault()
        setNodes((ns) => ns.map((n) => ({ ...n, selected: true })))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [rf, pasteObjects, center])

  // keyboard shortcuts for tools
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (e.metaKey || e.ctrlKey || e.altKey || el.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(el.tagName)) return
      if (e.key === 'Escape') return void dispatch(setTool('select'))
      if (e.shiftKey && e.key === '!') return void rf.fitView({ duration: 300, padding: 0.15 })
      const t = TOOLS.find((x) => x.key.toLowerCase() === e.key.toLowerCase())
      if (t) void changeTool(t.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [changeTool, dispatch, rf])

  const onNodesChange = useCallback((changes: NodeChange<ObjectNode>[]) => {
    setNodes((ns) => applyNodeChanges(changes, ns))
    const patches: ObjectPatch[] = []
    for (const c of changes) {
      if (c.type !== 'dimensions' || !c.dimensions) continue
      const n = rf.getNode(c.id)
      if (c.resizing && n && !resizeBefore.current.has(c.id))
        resizeBefore.current.set(c.id, { id: c.id, x: n.position.x, y: n.position.y, width: n.width ?? n.measured?.width, height: n.height ?? n.measured?.height })
      if (c.resizing === false) {
        patches.push({ id: c.id, width: c.dimensions.width, height: c.dimensions.height, ...(n ? { x: n.position.x, y: n.position.y } : {}) })
      }
    }
    if (patches.length) {
      const before = patches.map((p) => resizeBefore.current.get(p.id)).filter((p): p is ObjectPatch => !!p)
      if (before.length === patches.length) history.current.push({ type: 'patch', before, after: patches })
      patches.forEach((p) => resizeBefore.current.delete(p.id))
    }
    persist(patches)
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
    history.current.push({ type: 'patch', before: dragBefore.current, after: patches })
    persist(patches)
  }, [rf])

  const connect = useCallback(
    async (source: string, target: string) => {
      if (source === target) return
      if (edges.some((e) => e.source === source && e.target === target)) return
      const res = await addConnection({ whiteboardId: boardId, sourceId: source, targetId: target })
      if ('data' in res && res.data) history.current.push({ type: 'add', objects: [], connections: [res.data] })
    },
    [addConnection, boardId, edges]
  )

  const onConnect = useCallback((c: RFConnection) => void connect(c.source, c.target), [connect])

  const onPaneClick = useCallback(
    async (e: React.MouseEvent) => {
      connectFrom.current = null
      const pos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })
      if (tool === 'card') {
        dispatch(setTool('select'))
        await newCardAt(pos)
      } else if (tool === 'text') {
        dispatch(setTool('select'))
        const o = await place('text', { x: pos.x, y: pos.y - 20 }, { data: { text: '' } })
        if (o) autoEdit.current = o.id
        if (o) setNodes((ns) => ns.map((n) => (n.id === o.id ? { ...n, data: { ...n.data, autoEdit: true } } : n)))
      } else if (tool === 'section') {
        dispatch(setTool('select'))
        await place('section', { x: pos.x, y: pos.y }, { color: 'blue', data: { title: 'Section' } })
      }
    },
    [rf, tool, dispatch, newCardAt, place]
  )

  const onNodeClick = useCallback(
    (_e: React.MouseEvent, node: ObjectNode) => {
      if (tool !== 'connector') return
      if (!connectFrom.current) {
        connectFrom.current = node.id
        toast('Now click the target', { duration: 1500 })
      } else {
        void connect(connectFrom.current, node.id)
        connectFrom.current = null
      }
    },
    [tool, connect]
  )

  const onAction = useCallback(
    async (a: OverflowAction) => {
      const c = center()
      if (a === 'fit') return void rf.fitView({ duration: 300, padding: 0.15 })
      if (a === 'mindmap') return void (await place('mindmap', { x: c.x - 240, y: c.y - 160 }, { data: {} }))
      if (a === 'mermaid') {
        const o = await place('mermaid', { x: c.x - 210, y: c.y - 150 }, { data: {} })
        if (o) autoEdit.current = o.id
        return
      }
      if (a === 'whiteboard') {
        const res = await createWhiteboard({ name: 'Untitled whiteboard', parentId: boardId })
        if ('data' in res && res.data) await place('whiteboard', { x: c.x - 130, y: c.y - 70 }, { refId: res.data.id })
        return
      }
      if (a === 'autolayout') {
        const g = new dagre.graphlib.Graph()
        g.setGraph({ rankdir: 'LR', nodesep: 40, ranksep: 80 })
        g.setDefaultEdgeLabel(() => ({}))
        const linked = new Set(edges.flatMap((e) => [e.source, e.target]))
        const targets = nodes.filter((n) => linked.has(n.id) && n.type !== 'section')
        if (!targets.length) return void toast('Connect some objects first')
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
    [center, rf, place, createWhiteboard, boardId, edges, nodes]
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
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(CARD_MIME) || e.dataTransfer.types.includes('Files')) {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
        }
      }}
      onDrop={async (e) => {
        const pos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })
        const cardId = e.dataTransfer.getData(CARD_MIME)
        if (cardId) {
          e.preventDefault()
          await place('card', { x: pos.x - 160, y: pos.y - 30 }, { refId: cardId })
          return
        }
        const paths = [...e.dataTransfer.files].map((f) => window.files.pathFor(f)).filter(Boolean)
        if (!paths.length) return
        e.preventDefault()
        const files = await window.api.importFiles(paths)
        for (const [i, f] of files.entries())
          await place('file', { x: pos.x + i * 40, y: pos.y + i * 40 }, { refId: f.id, data: { name: f.name, mime: f.mime } })
        if (!files.length) toast.error('Unsupported file type')
      }}
    >
      <ReactFlow<ObjectNode, ConnectionEdge>
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
          if (objects.length || connections.length) history.current.push({ type: 'remove', objects, connections })
          if (objects.length) void removeObjects({ whiteboardId: boardId, ids: objects.map((o) => o.id) })
          const loose = connections.filter((c) => !objects.some((o) => o.id === c.sourceId || o.id === c.targetId))
          if (loose.length) void removeConnections({ whiteboardId: boardId, ids: loose.map((c) => c.id) })
        }}
        onConnect={onConnect}
        onPaneClick={onPaneClick}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={(_e, node) => {
          const o = node.data.object
          if (node.type === 'file' && o.refId) setViewing({ refId: o.refId, name: String(o.data.name ?? 'File'), mime: String(o.data.mime ?? '') })
        }}
        onEdgeDoubleClick={(e, edge) => {
          const r = wrapper.current!.getBoundingClientRect()
          setEdgeEdit({ id: edge.id, x: e.clientX - r.left, y: e.clientY - r.top, label: edge.data?.label ?? '' })
        }}
        onNodeContextMenu={(e, node) => {
          e.preventDefault()
          setMenu({ node, x: e.clientX, y: e.clientY })
        }}
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).classList.contains('react-flow__pane')) void newCardAt(rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }))
        }}
        onMoveEnd={onMoveEnd}
        defaultViewport={detail.whiteboard.viewport}
        fitView={!hasViewport && nodes.length > 0}
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
        connectionMode={ConnectionMode.Loose}
        nodesDraggable={tool !== 'connector'}
        panOnScroll
        zoomOnDoubleClick={false}
        selectionOnDrag={tool === 'select'}
        panOnDrag={tool === 'select' ? [1, 2] : true}
        minZoom={0.05}
        maxZoom={4}
        deleteKeyCode={['Backspace', 'Delete']}
        multiSelectionKeyCode="Shift"
        attributionPosition="bottom-left"
        defaultEdgeOptions={{ type: 'floating' }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="var(--canvas-dot)" />
      </ReactFlow>
      <CanvasToolbar tool={tool} onTool={(t) => void changeTool(t)} onAction={(a) => void onAction(a)} />
      <ZoomControls />
      <CardDrawer onBoard={cardIds} />
      {edgeEdit && (
        <input
          autoFocus
          value={edgeEdit.label}
          placeholder="Label"
          onChange={(e) => setEdgeEdit({ ...edgeEdit, label: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') setEdgeEdit(null)
          }}
          onBlur={async () => {
            const { id, label } = edgeEdit
            setEdgeEdit(null)
            await window.api.updateConnection({ id, label: label.trim() })
            setEdges((es) => es.map((x) => (x.id === id ? { ...x, label: label.trim() || undefined, data: { label: label.trim() } } : x)))
            dispatch(api.util.invalidateTags([{ type: 'Whiteboard', id: boardId }]))
          }}
          style={{ left: edgeEdit.x, top: edgeEdit.y }}
          className="absolute z-20 h-8 w-44 -translate-x-1/2 -translate-y-1/2 rounded-md border bg-background px-2 text-sm shadow-lg outline-none focus:ring-2 focus:ring-brand/40"
        />
      )}
      <FindOnBoard />
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
            if ('data' in conn && conn.data) history.current.push({ type: 'add', objects: [], connections: [conn.data] })
          }
          toast.success('Card created from highlight')
        }}
      />
      <NodeMenu menu={menu} onClose={() => setMenu(null)} onAction={(a, n) => void onMenuAction(a, n)} />
      {nodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="text-center text-sm text-muted-foreground">
            <p className="font-medium text-foreground">This whiteboard is empty</p>
            <p className="mt-1">Double-click anywhere to create a card, or press <kbd className="rounded border px-1">F</kbd> to add an existing one.</p>
          </div>
        </div>
      )}
      <AddCardDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        excludeIds={cardIds}
        onPick={async (cardId) => {
          setSearchOpen(false)
          const c = center()
          await place('card', { x: c.x - 160, y: c.y - 110 }, { refId: cardId })
        }}
        onCreate={async (title) => {
          setSearchOpen(false)
          await newCardAt(center(), title)
        }}
      />
    </div>
  )
}


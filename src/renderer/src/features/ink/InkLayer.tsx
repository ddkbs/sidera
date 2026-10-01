import { useReactFlow, useStore } from '@xyflow/react'
import { nanoid } from 'nanoid'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { toast } from 'sonner'
import type { WhiteboardObject } from '@shared/types'
import { t } from '@/lib/i18n'
import { record } from '@/lib/undo'
import { storageKey } from '@/lib/storage'
import { useAppDispatch, useAppSelector } from '@/store'
import { api } from '@/store/api'
import type { ObjectNode } from '@/features/canvas/types'
import { appendStrokes, eraseElements, newInk, penStroke, strokeToElement, type PenSettings } from './elements'
import { isFrameless } from './frame'
import {
  GROUP_GAP_PX,
  GROUP_PAUSE_MS,
  appendTarget,
  darkInk,
  freedrawOutline,
  hitInkObject,
  inkBounds,
  joinsGroup,
  outlinePath,
  screenToBoard,
  unionRects,
  type InkElement,
  type Point,
  type Rect
} from './geometry'
import { PenPalette } from './PenPalette'
import { IS_IPAD } from '@/lib/platform'

/** Eraser radius in screen px. */
export const ERASER_PX = 10

interface Stroke {
  points: [number, number, number][]
  settings: PenSettings
  realPressure: boolean
  elementId: string
  done: boolean
  /** committed: drop from the overlay once this object shows the element */
  committedTo?: string
  /** cached overlay paint for finished strokes (the outline is expensive to recompute every frame) */
  paint?: { path: Path2D; color: string; alpha: number; dark: boolean }
}

interface Group {
  strokes: Stroke[]
  /** board-space bounds of the group's ink (and of the object it appends to) */
  bounds: Rect
  lastAt: number
  /** existing ink object of this pen session the strokes are appended to */
  target: string | null
}

const SETTINGS_KEY = 'sidera.pen'
const loadSettings = (): PenSettings => {
  try {
    const s = JSON.parse(localStorage.getItem(storageKey(SETTINGS_KEY)) ?? 'null') as PenSettings | null
    if (s && typeof s.color === 'string' && typeof s.width === 'number') return { ...s, tool: s.tool === 'eraser' ? 'pen' : s.tool }
  } catch {
    /* ignore */
  }
  return { tool: 'pen', color: '#1e1e1e', width: 1 }
}

const nodeBox = (n: ObjectNode): Rect => ({ x: n.position.x, y: n.position.y, width: n.width ?? n.data.object.width, height: n.height ?? n.data.object.height })
const nodeElements = (n: ObjectNode): unknown[] => (Array.isArray(n.data.object.data.elements) ? (n.data.object.data.elements as unknown[]) : [])

/** Element of a (possibly unfinished) stroke in board coordinates. */
const strokeElement = (s: Stroke): InkElement => {
  const el = strokeToElement(penStroke(s.points, s.settings, s.realPressure), s.elementId)
  return s.done ? el : { ...el, lastCommittedPoint: null }
}

const strokeBounds = (s: Stroke): Rect | null => inkBounds([strokeElement(s)])

/**
 * Pen mode: draws ink straight onto the whiteboard. Pointer input is taken in the capture phase on the canvas host,
 * so xyflow never sees it (no selection / node drag); wheel and pinch still reach xyflow, so the board keeps panning
 * and zooming. Live strokes are painted on a canvas overlay with Excalidraw's own stroke outline; strokes drawn in
 * one go are committed as one frameless sketch object whose box equals the ink bounds (scale 1 → no jump).
 * `pencilOnly` (Sidera for iPad, any tool): only Apple Pencil input draws; fingers keep selecting, moving and panning.
 */
export function InkLayer({ host, boardId, pencilOnly = false }: { host: RefObject<HTMLDivElement | null>; boardId: string; pencilOnly?: boolean }) {
  const rf = useReactFlow<ObjectNode>()
  const dispatch = useAppDispatch()
  const dark = useAppSelector((s) => s.ui.theme) === 'dark'
  const transform = useStore((s) => s.transform)
  const nodes = useStore((s) => s.nodes) as ObjectNode[]
  const [settings, setSettingsState] = useState<PenSettings>(loadSettings)
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const canvas = useRef<HTMLCanvasElement>(null)
  const strokes = useRef<Stroke[]>([])
  const group = useRef<Group | null>(null)
  const idle = useRef<ReturnType<typeof setTimeout>>(undefined)
  /** ink objects created in this pen session: new strokes near one are appended to it */
  const sessionObjects = useRef(new Set<string>())
  // on the iPad a finger never draws, even in pen mode: it pans the board
  const penSeen = useRef(IS_IPAD)
  const pencilOnlyRef = useRef(pencilOnly)
  pencilOnlyRef.current = pencilOnly
  /** end of the last pencil stroke: the click Safari synthesizes for it must not select what is underneath */
  const lastPenUp = useRef(0)
  const darkRef = useRef(dark)
  darkRef.current = dark
  const frame = useRef(0)

  const setSettings = (s: PenSettings): void => {
    if (s.tool === 'eraser') void flush()
    setSettingsState(s)
    try {
      localStorage.setItem(storageKey(SETTINGS_KEY), JSON.stringify(s))
    } catch {
      /* ignore */
    }
  }

  const refresh = (): void => void dispatch(api.util.invalidateTags([{ type: 'Whiteboard', id: boardId }]))

  // ─── overlay painting ────────────────────────────────────────────────────────────────────────────
  const paint = (): void => {
    frame.current = 0
    const c = canvas.current
    const h = host.current
    if (!c || !h) return
    const dpr = window.devicePixelRatio || 1
    const w = h.clientWidth
    const hh = h.clientHeight
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(hh * dpr)) {
      c.width = Math.round(w * dpr)
      c.height = Math.round(hh * dpr)
    }
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, c.width, c.height)
    const vp = rf.getViewport()
    ctx.setTransform(dpr * vp.zoom, 0, 0, dpr * vp.zoom, dpr * vp.x, dpr * vp.y)
    for (const s of strokes.current) {
      if (!s.points.length) continue
      let cached = s.paint
      if (!cached || cached.dark !== darkRef.current) {
        const el = strokeElement(s)
        cached = { path: new Path2D(outlinePath(freedrawOutline(el))), color: (darkRef.current ? darkInk(el.strokeColor) : el.strokeColor) ?? '#1e1e1e', alpha: (el.opacity ?? 100) / 100, dark: darkRef.current }
        if (s.done) s.paint = cached
      }
      ctx.globalAlpha = cached.alpha
      ctx.fillStyle = cached.color
      ctx.fill(cached.path)
    }
    ctx.globalAlpha = 1
  }
  const schedule = (): void => {
    if (!frame.current) frame.current = requestAnimationFrame(paint)
  }
  useEffect(schedule, [transform, dark])

  // committed strokes stay on the overlay until the board shows them (no flicker between overlay and node)
  useEffect(() => {
    const before = strokes.current.length
    strokes.current = strokes.current.filter((s) => {
      if (!s.committedTo) return true
      const n = nodes.find((x) => x.id === s.committedTo)
      return !(n && nodeElements(n).some((e) => (e as InkElement).id === s.elementId))
    })
    if (strokes.current.length !== before) schedule()
  })

  // ─── committing ──────────────────────────────────────────────────────────────────────────────────
  const commit = async (g: Group): Promise<void> => {
    const done = g.strokes.filter((s) => s.done && s.points.length)
    if (!done.length) return
    const target = g.target ? (rf.getNode(g.target) as ObjectNode | undefined) : undefined
    const newStrokes = done.map((s) => ({ stroke: penStroke(s.points, s.settings, s.realPressure), id: s.elementId }))
    try {
      if (target) {
        const before = { ...target.data.object, ...nodeBox(target) }
        const ink = appendStrokes(nodeElements(target), nodeBox(target), newStrokes)
        if (!ink) throw new Error('empty target')
        const after = { id: before.id, ...ink.box, data: { ...before.data, elements: ink.elements } }
        const prev = { id: before.id, x: before.x, y: before.y, width: before.width, height: before.height, data: before.data }
        await window.api.updateObjects([after])
        done.forEach((s) => (s.committedTo = before.id))
        refresh()
        record({
          label: t('undo.draw'),
          undo: async () => {
            await window.api.updateObjects([prev])
            refresh()
          },
          redo: async () => {
            await window.api.updateObjects([after])
            refresh()
          }
        })
      } else {
        const ink = newInk(newStrokes)
        if (!ink) return
        const o = await window.api.addObject({ whiteboardId: boardId, kind: 'sketch', ...ink.box, data: { elements: ink.elements, files: {}, frameless: true } })
        sessionObjects.current.add(o.id)
        done.forEach((s) => (s.committedTo = o.id))
        refresh()
        let obj: WhiteboardObject = o
        record({
          label: t('undo.draw'),
          undo: async () => {
            const n = rf.getNode(o.id) as ObjectNode | undefined
            if (n) obj = { ...n.data.object, ...nodeBox(n) }
            await window.api.removeObjects([o.id])
            refresh()
          },
          redo: async () => {
            await window.api.restoreObjects([obj], [])
            refresh()
          }
        })
      }
    } catch (e) {
      console.error('[ink] commit failed', e)
      toast.error(t('ink.saveFailed'))
      strokes.current = strokes.current.filter((s) => !done.includes(s))
    }
    // safety net: never leave committed ink on the overlay
    setTimeout(() => {
      strokes.current = strokes.current.filter((s) => !done.includes(s))
      schedule()
    }, 3000)
    schedule()
  }

  const flush = async (): Promise<void> => {
    clearTimeout(idle.current)
    const g = group.current
    group.current = null
    if (g) await commit(g)
  }

  // leaving pen mode (unmount) commits what is still pending
  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current)
      frame.current = 0 // else a remount (StrictMode) thinks a frame is pending and never paints again
      void flush()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  // ─── pointer input ───────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = host.current
    if (!el) return
    let drawing: Stroke | null = null
    let erasing: { originals: Map<string, WhiteboardObject>; hit: Map<string, Set<string>> } | null = null
    let pointerId: number | null = null
    // measured once per stroke: getBoundingClientRect on every (coalesced) move forces layout
    let originCache: Point | null = null

    const origin = (): Point => {
      if (originCache) return originCache
      const r = el.getBoundingClientRect()
      return { x: r.left, y: r.top }
    }
    const toBoard = (e: PointerEvent): Point => screenToBoard({ x: e.clientX, y: e.clientY }, origin(), rf.getViewport())
    const pressure = (e: PointerEvent): number => (e.pointerType === 'pen' ? Math.max(0.05, Math.min(1, e.pressure || 0.5)) : 0.5)

    const eraseAt = (p: Point): void => {
      if (!erasing) return
      const zoom = rf.getViewport().zoom
      for (const n of rf.getNodes() as ObjectNode[]) {
        if (n.type !== 'sketch' || n.hidden || !isFrameless(n.data.object.data)) continue
        const orig = erasing.originals.get(n.id)
        const box = orig ? { x: orig.x, y: orig.y, width: orig.width, height: orig.height } : nodeBox(n)
        const els = orig ? (orig.data.elements as unknown[]) : nodeElements(n)
        const hits = hitInkObject(els, box, p, ERASER_PX / zoom)
        const known = erasing.hit.get(n.id)
        if (!hits.length || (known && hits.every((id) => known.has(id)))) continue
        if (!orig) erasing.originals.set(n.id, { ...n.data.object, ...nodeBox(n) })
        const set = known ?? new Set<string>()
        hits.forEach((id) => set.add(id))
        erasing.hit.set(n.id, set)
        // live preview: hide erased strokes, keep the rest exactly in place
        const o = erasing.originals.get(n.id)!
        const next = erasedPatch(o, set)
        rf.updateNode(n.id, next ? { position: { x: next.x, y: next.y }, width: next.width, height: next.height, data: { ...n.data, object: { ...o, ...next } } } : { hidden: true })
      }
    }

    const finishErase = async (): Promise<void> => {
      const e = erasing
      erasing = null
      if (!e || !e.hit.size) return
      const originals = [...e.originals.values()]
      const patches = originals.map((o) => ({ o, next: erasedPatch(o, e.hit.get(o.id)!) }))
      const apply = async (forward: boolean): Promise<void> => {
        const removed = patches.filter((p) => !p.next).map((p) => p.o)
        const changed = patches.filter((p) => p.next)
        if (forward) {
          if (changed.length) await window.api.updateObjects(changed.map((p) => ({ id: p.o.id, ...p.next! })))
          if (removed.length) await window.api.removeObjects(removed.map((o) => o.id))
        } else {
          if (removed.length) await window.api.restoreObjects(removed, [])
          if (changed.length) await window.api.updateObjects(changed.map((p) => ({ id: p.o.id, x: p.o.x, y: p.o.y, width: p.o.width, height: p.o.height, data: p.o.data })))
        }
        refresh()
      }
      await apply(true)
      record({ label: t('undo.eraseInk'), undo: () => apply(false), redo: () => apply(true) })
    }

    const onDown = (e: PointerEvent): void => {
      if (e.button !== 0 || pointerId !== null) return
      const target = e.target as HTMLElement
      if (!target.closest('.react-flow') || target.closest('.react-flow__panel, [data-pen-ui]')) return
      if (pencilOnlyRef.current && (e.pointerType !== 'pen' || target.closest('[contenteditable="true"], input, textarea, select, button'))) return
      if (e.pointerType === 'pen') penSeen.current = true
      if (e.pointerType === 'touch' && penSeen.current) return
      e.preventDefault()
      e.stopPropagation()
      pointerId = e.pointerId
      try {
        el.setPointerCapture(e.pointerId)
      } catch {
        /* synthetic / already released pointer */
      }
      clearTimeout(idle.current)
      originCache = null
      originCache = origin() // re-measure (window may have scrolled/resized since the last stroke)
      const s = settingsRef.current
      const p = toBoard(e)
      if (s.tool === 'eraser') {
        erasing = { originals: new Map(), hit: new Map() }
        eraseAt(p)
        return
      }
      const now = performance.now()
      const gap = GROUP_GAP_PX / rf.getViewport().zoom
      if (!joinsGroup(group.current, p, now, gap)) {
        void flush()
        const candidates = (rf.getNodes() as ObjectNode[])
          .filter((n) => sessionObjects.current.has(n.id) && !n.hidden && isFrameless(n.data.object.data))
          .map((n) => ({ id: n.id, box: nodeBox(n) }))
        const t = appendTarget(candidates, p, gap / 4)
        group.current = { strokes: [], bounds: t ? t.box : { x: p.x, y: p.y, width: 0, height: 0 }, lastAt: now, target: t?.id ?? null }
      }
      drawing = { points: [[p.x, p.y, pressure(e)]], settings: s, realPressure: e.pointerType === 'pen', elementId: nanoid(), done: false }
      group.current!.strokes.push(drawing)
      strokes.current.push(drawing)
      schedule()
    }

    const onMove = (e: PointerEvent): void => {
      if (e.pointerId !== pointerId) return
      e.stopPropagation()
      const events = e.getCoalescedEvents?.() ?? []
      const vpZoom = rf.getViewport().zoom
      for (const ev of events.length ? events : [e]) {
        const p = toBoard(ev)
        if (erasing) {
          eraseAt(p)
          continue
        }
        if (!drawing) continue
        const zoom = vpZoom
        const last = drawing.points[drawing.points.length - 1]
        if (Math.hypot(p.x - last[0], p.y - last[1]) * zoom < 0.75) continue
        drawing.points.push([p.x, p.y, pressure(ev)])
      }
      if (drawing) schedule()
    }

    const onUp = (e: PointerEvent): void => {
      if (e.pointerId !== pointerId) return
      e.stopPropagation()
      pointerId = null
      originCache = null
      lastPenUp.current = performance.now()
      try {
        if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
      if (erasing) return void finishErase()
      const s = drawing
      drawing = null
      const g = group.current
      if (!s || !g) return
      s.done = true
      g.lastAt = performance.now()
      g.bounds = unionRects([g.bounds.width || g.bounds.height ? g.bounds : null, strokeBounds(s)]) ?? g.bounds
      schedule()
      idle.current = setTimeout(() => void flush(), GROUP_PAUSE_MS)
    }

    // a click must never reach xyflow in pen mode (it would select / deselect)
    const swallowClick = (e: MouseEvent): void => {
      if (pencilOnlyRef.current && performance.now() - lastPenUp.current > 400) return
      const t = e.target as HTMLElement
      if (t.closest('.react-flow') && !t.closest('.react-flow__panel, [data-pen-ui]')) e.stopPropagation()
    }

    // iPadOS also fires touch events for Apple Pencil (touchType 'stylus'); xyflow's d3-zoom pans on touch events,
    // so pencil touches must never reach it — only fingers pan / pinch.
    const swallowStylus = (e: TouchEvent): void => {
      const stylus = Array.from(e.changedTouches).some((t) => (t as Touch & { touchType?: string }).touchType === 'stylus')
      if (!stylus) return
      const t = e.target as HTMLElement
      if (!t.closest('.react-flow') || t.closest('.react-flow__panel, [data-pen-ui], [contenteditable="true"], input, textarea, select, button')) return
      e.stopPropagation()
      if (e.cancelable) e.preventDefault()
    }

    el.addEventListener('touchstart', swallowStylus, { capture: true, passive: false })
    el.addEventListener('touchmove', swallowStylus, { capture: true, passive: false })
    el.addEventListener('touchend', swallowStylus, true)
    el.addEventListener('pointerdown', onDown, true)
    el.addEventListener('pointermove', onMove, true)
    el.addEventListener('pointerup', onUp, true)
    el.addEventListener('pointercancel', onUp, true)
    el.addEventListener('click', swallowClick, true)
    el.addEventListener('dblclick', swallowClick, true)
    return () => {
      el.removeEventListener('touchstart', swallowStylus, true)
      el.removeEventListener('touchmove', swallowStylus, true)
      el.removeEventListener('touchend', swallowStylus, true)
      el.removeEventListener('pointerdown', onDown, true)
      el.removeEventListener('pointermove', onMove, true)
      el.removeEventListener('pointerup', onUp, true)
      el.removeEventListener('pointercancel', onUp, true)
      el.removeEventListener('click', swallowClick, true)
      el.removeEventListener('dblclick', swallowClick, true)
      if (erasing) void finishErase()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host, rf, boardId])

  // cursor (pen / eraser) on the whole board while in pen mode
  useEffect(() => {
    const el = host.current
    if (!el || pencilOnly) return
    el.dataset.pen = settings.tool === 'eraser' ? 'eraser' : 'pen'
    return () => void delete el.dataset.pen
  }, [host, settings.tool, pencilOnly])

  return (
    <>
      <canvas ref={canvas} className="pointer-events-none absolute inset-0 z-[5] size-full" />
      {!pencilOnly && <PenPalette settings={settings} onChange={setSettings} dark={dark} />}
    </>
  )
}

/** Object after erasing `ids`: remaining elements, box shrunk so they stay in place; null = nothing left. */
function erasedPatch(o: WhiteboardObject, ids: Set<string>): { x: number; y: number; width: number; height: number; data: Record<string, unknown> } | null {
  const ink = eraseElements(Array.isArray(o.data.elements) ? o.data.elements : [], { x: o.x, y: o.y, width: o.width, height: o.height }, ids)
  return ink ? { ...ink.box, data: { ...o.data, elements: ink.elements } } : null
}

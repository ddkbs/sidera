import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { APP_NAME } from '@shared/brand'
import { ArrowLeft, ArrowRight, Check, X } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { t } from '@/lib/i18n'
import { COMMAND_BY_ID, commandLabel, formatBinding, useBindings, useCommands } from '@/lib/shortcuts'
import { cn } from '@/lib/utils'
import { store, useAppDispatch } from '@/store'
import { useListWhiteboardsQuery } from '@/store/api'
import { navigate, toggleSidebar } from '@/store/ui'
import { placePopover, sameRect, spotlightRect, type Rect, type Size } from './geometry'
import { TOUR_STEPS, type TourStep } from './steps'

const POPOVER_WIDTH = 380
/**
 * How long to wait for a step's target (navigation + render) before showing a centered popover. Kept short
 * so the old spotlight never lingers; if the target shows up later the spotlight simply glides to it.
 */
const TARGET_TIMEOUT_MS = 300
const SPRING = { type: 'spring', stiffness: 260, damping: 32, mass: 0.9 } as const

/** First visible element carrying `data-tour="<id>"` (some ids exist twice, e.g. with the sidebar hidden). */
function findTarget(id: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${id}"]`)) {
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) return el
  }
  return null
}

/** Makes sure what a step points at exists: sidebar open, a whiteboard on screen. */
function usePrepareStep(step: TourStep): void {
  const dispatch = useAppDispatch()
  const { data: boards } = useListWhiteboardsQuery()
  useEffect(() => {
    const ui = store.getState().ui
    if (step.needs === 'sidebar' && !ui.sidebarOpen) dispatch(toggleSidebar())
    if (step.needs === 'whiteboard' && ui.view.type !== 'whiteboard' && boards?.length) {
      const recent = [...boards].sort((a, b) => b.updatedAt - a.updatedAt)[0]
      dispatch(navigate({ type: 'whiteboard', id: recent.id }))
    }
  }, [step, boards, dispatch])
}

/** Follows the step's target every frame (handles resize, scrolling, sidebar/panel animations). */
function useTargetRect(step: TourStep): { rect: Rect | null; viewport: Size; missing: boolean } {
  const [rect, setRect] = useState<Rect | null>(null)
  const [missing, setMissing] = useState(false)
  const [viewport, setViewport] = useState<Size>({ width: window.innerWidth, height: window.innerHeight })
  useEffect(() => {
    let raf = 0
    let scrolled = false
    const started = performance.now()
    const tick = (): void => {
      setViewport((v) => (v.width === window.innerWidth && v.height === window.innerHeight ? v : { width: window.innerWidth, height: window.innerHeight }))
      const el = step.target ? findTarget(step.target) : null
      if (el) {
        if (!scrolled) {
          el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
          scrolled = true
        }
        const r = el.getBoundingClientRect()
        const next = { x: r.x, y: r.y, width: r.width, height: r.height }
        setRect((prev) => (sameRect(prev, next) ? prev : next))
        setMissing(false)
      } else if (!step.target || performance.now() - started > TARGET_TIMEOUT_MS) {
        setRect(null) // centered fallback
        setMissing(!!step.target)
      }
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [step])
  return { rect, viewport, missing }
}

export function Tour({ onClose }: { onClose: (completed: boolean) => void }) {
  const [index, setIndex] = useState(0)
  const step = TOUR_STEPS[index]
  const last = index === TOUR_STEPS.length - 1
  usePrepareStep(step)
  const { rect, viewport, missing } = useTargetRect(step)
  const bindings = useBindings()

  const popoverRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<Size>({ width: POPOVER_WIDTH, height: 200 })
  useLayoutEffect(() => {
    const el = popoverRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ width: el.offsetWidth, height: el.offsetHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  useEffect(() => popoverRef.current?.focus({ preventScroll: true }), [])

  const next = (): void => (last ? onClose(true) : setIndex((i) => i + 1))
  const back = (): void => setIndex((i) => Math.max(0, i - 1))
  useCommands({ 'onboarding.next': next, 'onboarding.confirm': next, 'onboarding.back': back, 'onboarding.skip': () => onClose(false) }, true, true)

  const hole = rect ? spotlightRect(rect, viewport, step.padding ?? 6) : null
  const pos = placePopover(hole, size, viewport, 14, 12, step.placement)
  // Without a target the cutout shrinks into the middle of the popover and fades out.
  const cut = hole ?? { x: pos.x + size.width / 2, y: pos.y + size.height / 2, width: 0, height: 0 }
  const radius = hole ? Math.min(12, hole.height / 2) : 0

  const hints = [
    ...(step.shortcuts ?? []).map((id) => ({ label: commandLabel(COMMAND_BY_ID[id]), keys: bindings[id] ? formatBinding(bindings[id]) : '' })),
    ...(step.keys ?? [])
  ].filter((h) => h.keys)

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[200] select-none"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      onMouseDown={(e) => e.preventDefault()}
      onWheel={(e) => e.stopPropagation()}
    >
      <svg className="absolute inset-0 size-full" aria-hidden>
        <defs>
          <mask id="onboarding-spotlight">
            <rect width="100%" height="100%" fill="white" />
            <motion.rect fill="black" initial={false} animate={{ ...cut, rx: radius, ry: radius }} transition={SPRING} />
          </mask>
        </defs>
        <rect width="100%" height="100%" className="fill-black/45 dark:fill-black/65" mask="url(#onboarding-spotlight)" />
        {/* soft outer glow + crisp ring */}
        <motion.rect
          fill="none"
          className="stroke-white/40"
          strokeWidth={6}
          style={{ filter: 'blur(6px)' }}
          initial={false}
          animate={{ ...cut, rx: radius, ry: radius, opacity: hole ? [0.5, 1, 0.5] : 0 }}
          transition={{ ...SPRING, opacity: { duration: 2.4, repeat: Infinity, ease: 'easeInOut' } }}
        />
        <motion.rect
          fill="none"
          className="stroke-white/90"
          strokeWidth={1.5}
          initial={false}
          animate={{ ...cut, rx: radius, ry: radius, opacity: hole ? 1 : 0 }}
          transition={SPRING}
        />
      </svg>

      <motion.div
        ref={popoverRef}
        tabIndex={-1}
        role="dialog"
        aria-modal
        aria-labelledby="tour-title"
        className="absolute rounded-2xl border bg-popover outline-none text-popover-foreground shadow-[0_24px_60px_-16px_rgba(0,0,0,0.45),0_2px_6px_rgba(0,0,0,0.08)]"
        style={{ width: POPOVER_WIDTH }}
        initial={{ opacity: 0, scale: 0.96, left: pos.x, top: pos.y }}
        animate={{ opacity: 1, scale: 1, left: pos.x, top: pos.y }}
        transition={SPRING}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {pos.side !== 'center' && <Arrow side={pos.side} offset={pos.arrow} />}
        <div className="relative p-5">
          <button
            onClick={() => onClose(false)}
            className="absolute top-3 right-3 grid size-7 place-items-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
            aria-label={t('tour.close')}
          >
            <X className="size-3.5" />
          </button>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.16 }}
            >
              <h3 id="tour-title" className="pr-6 text-[15px] leading-snug font-semibold tracking-tight">
                {last && <Check className="mr-1.5 inline size-4 -translate-y-px text-emerald-500" />}
                {t(step.title)}
              </h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{t(missing && step.fallbackBody ? step.fallbackBody : step.body, { app: APP_NAME })}</p>
              {hints.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  {hints.map((h, i) => (
                    <span key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Kbd className="h-5 border bg-muted/60 px-1.5 text-[11px] text-foreground/80">{h.keys}</Kbd>
                      {h.label}
                    </span>
                  ))}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
          <div className="mt-5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-medium text-muted-foreground tabular-nums">
                {index + 1} / {TOUR_STEPS.length}
              </span>
              <div className="flex items-center gap-1" aria-hidden>
                {TOUR_STEPS.map((s, i) => (
                  <motion.span
                    key={s.id}
                    className={cn('block h-1 rounded-full', i <= index ? 'bg-foreground/70' : 'bg-foreground/15')}
                    initial={false}
                    animate={{ width: i === index ? 12 : 4 }}
                    transition={SPRING}
                  />
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {!last && (
                <Button variant="ghost" size="sm" className="h-8 px-2.5 text-muted-foreground" onClick={() => onClose(false)}>
                  {t('common.skip')}
                </Button>
              )}
              {index > 0 && (
                <Button variant="outline" size="sm" className="h-8 gap-1 px-2.5" onClick={back} aria-label={t('cmd.onboarding.back')}>
                  <ArrowLeft className="size-3.5" />
                  {t('common.back')}
                </Button>
              )}
              <Button size="sm" className="h-8 gap-1 px-3" onClick={next}>
                {last ? t('tour.startExploring') : t('common.next')}
                {!last && <ArrowRight className="size-3.5" />}
              </Button>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  )
}

/** Small pointer on the popover edge facing the target. */
function Arrow({ side, offset }: { side: 'left' | 'right' | 'top' | 'bottom'; offset: number }) {
  // `side` is where the popover sits relative to the target, so the arrow goes on the opposite edge.
  const style =
    side === 'right'
      ? { left: -6, top: offset - 6 }
      : side === 'left'
        ? { right: -6, top: offset - 6 }
        : side === 'bottom'
          ? { top: -6, left: offset - 6 }
          : { bottom: -6, left: offset - 6 }
  const borders = { right: 'border-b border-l', left: 'border-t border-r', bottom: 'border-t border-l', top: 'border-b border-r' }[side]
  return <span aria-hidden className={cn('absolute size-3 rotate-45 bg-popover', borders)} style={style} />
}

import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, X } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { useAppDispatch, useAppSelector } from '@/store'
import { useListWhiteboardsQuery } from '@/store/api'
import { updateSettings } from '@/store/settings'
import { navigate } from '@/store/ui'
import { placePopover, type Rect } from './geometry'
import { TOUR_STEPS } from './steps'

const POPOVER_SIZE = { width: 320, height: 190 }
const MAX_TARGET_WAIT_FRAMES = 45 // ~750ms at 60fps — enough for a navigation + render to settle

export function Tour() {
  const dispatch = useAppDispatch()
  const tourCompleted = useAppSelector((s) => s.settings.tourCompleted)
  const { data: boards } = useListWhiteboardsQuery()
  const [active, setActive] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight })
  const popoverRef = useRef<HTMLDivElement>(null)
  const [popoverSize, setPopoverSize] = useState(POPOVER_SIZE)

  const step = active ? TOUR_STEPS[stepIndex] : undefined

  // Auto-start shortly after first render settles, and whenever "Restart tour" flips this back to false.
  useEffect(() => {
    if (tourCompleted) return
    const t = setTimeout(() => {
      setStepIndex(0)
      setActive(true)
    }, 500)
    return () => clearTimeout(t)
  }, [tourCompleted])

  const finish = (): void => {
    setActive(false)
    void dispatch(updateSettings({ tourCompleted: true }))
  }

  // Navigate to a whiteboard before a step that needs the canvas to exist.
  useEffect(() => {
    if (!step?.needsWhiteboard || boards === undefined) return
    if (!boards.length) {
      // nothing to show this step on — skip it
      setStepIndex((i) => Math.min(i + 1, TOUR_STEPS.length - 1))
      return
    }
    dispatch(navigate({ type: 'whiteboard', id: boards[0].id }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, boards])

  // Measure (and re-measure) the current step's target; skip the step if it never shows up.
  useEffect(() => {
    if (!step) return
    if (!step.target) {
      setRect(null)
      return
    }
    let raf = 0
    let tries = 0
    const check = (): void => {
      const el = document.querySelector(`[data-tour="${step.target}"]`)
      if (el) {
        setRect(el.getBoundingClientRect())
        return
      }
      tries++
      if (tries > MAX_TARGET_WAIT_FRAMES) {
        setStepIndex((i) => Math.min(i + 1, TOUR_STEPS.length - 1))
        return
      }
      raf = requestAnimationFrame(check)
    }
    check()
    return () => cancelAnimationFrame(raf)
  }, [step])

  // Reposition on resize (and keep the target rect fresh while the window changes).
  useEffect(() => {
    if (!active) return
    const onResize = (): void => {
      setViewport({ width: window.innerWidth, height: window.innerHeight })
      if (step?.target) {
        const el = document.querySelector(`[data-tour="${step.target}"]`)
        if (el) setRect(el.getBoundingClientRect())
      }
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [active, step])

  useLayoutEffect(() => {
    if (!popoverRef.current) return
    const r = popoverRef.current.getBoundingClientRect()
    if (r.width && r.height && (r.width !== popoverSize.width || r.height !== popoverSize.height)) setPopoverSize({ width: r.width, height: r.height })
  })

  const next = (): void => {
    if (stepIndex >= TOUR_STEPS.length - 1) finish()
    else setStepIndex((i) => i + 1)
  }
  const back = (): void => setStepIndex((i) => Math.max(0, i - 1))

  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') finish()
      else if (e.key === 'ArrowRight' || e.key === 'Enter') next()
      else if (e.key === 'ArrowLeft') back()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stepIndex])

  if (!active || !step) return null

  const pos = placePopover(rect, popoverSize, viewport)
  const spotlightPadding = 8

  return createPortal(
    <div className="fixed inset-0 z-[100]">
      <AnimatePresence mode="wait">
        <motion.div
          key="overlay"
          className={rect ? 'absolute inset-0' : 'absolute inset-0 bg-black/55'}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={(e) => e.stopPropagation()}
        >
          {rect && (
            <motion.div
              layout
              className="pointer-events-none absolute rounded-xl"
              animate={{
                left: rect.x - spotlightPadding,
                top: rect.y - spotlightPadding,
                width: rect.width + spotlightPadding * 2,
                height: rect.height + spotlightPadding * 2
              }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)' }}
            />
          )}
        </motion.div>
      </AnimatePresence>

      <AnimatePresence mode="wait">
        <motion.div
          key={step.id}
          ref={popoverRef}
          role="dialog"
          aria-label={step.title}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1, left: pos.x, top: pos.y }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          className="absolute w-80 rounded-2xl border bg-popover p-4 text-popover-foreground shadow-[0_20px_50px_-12px_rgba(0,0,0,0.35)]"
          style={{ left: pos.x, top: pos.y }}
        >
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-sm font-semibold">{step.title}</h3>
            <button onClick={finish} className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground" aria-label="Skip tour">
              <X className="size-3.5" />
            </button>
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">{step.body}</p>
          {step.id === 'done' && (
            <Button
              size="sm"
              className="mt-3 w-full"
              onClick={() => {
                const welcome = boards?.find((b) => b.name === 'Welcome to CanvasCL') ?? boards?.[0]
                if (welcome) dispatch(navigate({ type: 'whiteboard', id: welcome.id }))
                finish()
              }}
            >
              Open the Welcome whiteboard
            </Button>
          )}
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {stepIndex + 1} of {TOUR_STEPS.length}
            </span>
            <div className="flex items-center gap-1">
              {stepIndex > 0 && (
                <Button variant="ghost" size="sm" className="h-7 gap-1 px-2" onClick={back}>
                  <ChevronLeft className="size-3.5" /> Back
                </Button>
              )}
              <Button size="sm" className="h-7 gap-1 px-2.5" onClick={next}>
                {stepIndex >= TOUR_STEPS.length - 1 ? 'Done' : 'Next'}
                {stepIndex < TOUR_STEPS.length - 1 && <ChevronRight className="size-3.5" />}
              </Button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>,
    document.body
  )
}

import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { APP_NAME } from '@shared/brand'
import { LANG_NAMES, LANGS } from '@shared/i18n'
import appIcon from '@/assets/onboarding/app-icon.png'
import { ArrowLeft, ArrowRight, Check, Sparkles } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { t, useLang } from '@/lib/i18n'
import { useCommands } from '@/lib/shortcuts'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store'
import { updateSettings } from '@/store/settings'
import { WELCOME_SLIDES } from './slides'

const EASE = [0.22, 1, 0.36, 1] as const

/** Full-window welcome slides shown on first launch (and from "Show welcome screens"). */
export function Welcome({ onDone }: { onDone: (next: 'tour' | 'explore') => void }) {
  const [[index, direction], setPage] = useState<[number, number]>([0, 1])
  const theme = useAppSelector((s) => s.ui.theme)
  const port = useAppSelector((s) => s.settings.mcp.port)
  const slide = WELCOME_SLIDES[index]
  const last = index === WELCOME_SLIDES.length - 1
  const rootRef = useRef<HTMLDivElement>(null)

  const go = (i: number): void => {
    if (i < 0 || i >= WELCOME_SLIDES.length || i === index) return
    setPage([i, i > index ? 1 : -1])
  }
  const next = (): void => (last ? onDone('tour') : go(index + 1))
  useCommands(
    {
      'onboarding.next': () => go(index + 1),
      'onboarding.confirm': next,
      'onboarding.back': () => go(index - 1),
      'onboarding.skip': () => onDone('explore')
    },
    true,
    true
  )
  // Take focus away from whatever was focused underneath (keys are handled via onboarding commands).
  useEffect(() => rootRef.current?.focus({ preventScroll: true }), [])

  // Warm the cache so switching slides never shows a half-loaded screenshot.
  useEffect(() => {
    for (const s of WELCOME_SLIDES) new Image().src = s.image[theme]
  }, [theme])

  const slug = APP_NAME.toLowerCase().replace(/[^a-z0-9]+/g, '-')

  return createPortal(
    <motion.div
      ref={rootRef}
      tabIndex={-1}
      role="dialog"
      aria-modal
      aria-label={t('welcome.label', { app: APP_NAME })}
      className="fixed inset-0 z-[200] flex flex-col overflow-hidden bg-background text-foreground outline-none"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.02, filter: 'blur(4px)' }}
      transition={{ duration: 0.35, ease: EASE }}
    >
      <Backdrop />

      {/* draggable title area (traffic lights sit top-left) */}
      <div className="drag-region relative flex h-12 shrink-0 items-center justify-end px-5">
        {!last && (
          <button
            onClick={() => onDone('explore')}
            className="no-drag rounded-md px-2.5 py-1 text-[13px] text-muted-foreground transition hover:bg-accent hover:text-foreground"
          >
            {t('welcome.skipIntro')}
          </button>
        )}
      </div>

      <div className="relative mx-auto grid min-h-0 w-full max-w-[1320px] flex-1 grid-cols-1 items-center gap-14 px-14 pb-12 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        {/* text column */}
        <div className="flex max-w-[420px] flex-col justify-self-center lg:justify-self-start">
          <div className="flex items-center gap-2.5">
            <img src={appIcon} alt="" className="size-7 rounded-[8px] shadow-sm ring-1 ring-border" draggable={false} />
            <span className="text-sm font-medium tracking-tight">{APP_NAME}</span>
          </div>

          <div className="relative mt-10 min-h-[372px]">
            <AnimatePresence mode="wait" initial={false} custom={direction}>
              <motion.div
                key={slide.id}
                custom={direction}
                variants={{
                  enter: (d: number) => ({ opacity: 0, x: 24 * d }),
                  center: { opacity: 1, x: 0 },
                  exit: (d: number) => ({ opacity: 0, x: -24 * d })
                }}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.28, ease: EASE }}
              >
                <div className="inline-flex items-center gap-2 rounded-full border bg-background/70 px-2.5 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
                  <span className="size-1.5 rounded-full bg-gradient-to-br from-violet-500 to-sky-500" />
                  <span className="tabular-nums">{String(index + 1).padStart(2, '0')}</span>
                  <span className="text-muted-foreground/50">·</span>
                  {t(slide.eyebrow)}
                </div>
                <h1 className="mt-4 text-[38px] leading-[1.08] font-semibold tracking-[-0.025em] text-balance">{t(slide.title, { app: APP_NAME })}</h1>
                <p className="mt-4 text-[15px] leading-relaxed text-pretty text-muted-foreground">{t(slide.body, { app: APP_NAME })}</p>
                {slide.id === 'language' && <LanguagePicker />}
                <ul className="mt-7 flex flex-col gap-3">
                  {slide.points.map(({ icon: Icon, text }, i) => (
                    <motion.li
                      key={text}
                      className="flex items-center gap-3 text-[13.5px]"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.08 + i * 0.06, duration: 0.3, ease: EASE }}
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg border bg-card text-foreground/80 shadow-xs">
                        <Icon className="size-4" />
                      </span>
                      {t(text)}
                    </motion.li>
                  ))}
                </ul>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* navigation */}
          <div className="mt-8 flex items-center justify-between gap-6">
            <div className="flex items-center gap-1.5" role="tablist" aria-label={t('welcome.slides')}>
              {WELCOME_SLIDES.map((s, i) => (
                <button
                  key={s.id}
                  role="tab"
                  aria-selected={i === index}
                  aria-label={t('welcome.slideN', { n: i + 1, name: t(s.eyebrow) })}
                  onClick={() => go(i)}
                  className="group grid h-4 place-items-center"
                >
                  <motion.span
                    className={cn(
                      'block h-1.5 rounded-full transition-colors',
                      i === index ? 'bg-foreground' : 'bg-foreground/15 group-hover:bg-foreground/30'
                    )}
                    animate={{ width: i === index ? 22 : 6 }}
                    transition={{ duration: 0.3, ease: EASE }}
                  />
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              {index > 0 && (
                <Button variant="ghost" className="h-9 gap-1.5 px-3 text-muted-foreground" onClick={() => go(index - 1)}>
                  <ArrowLeft className="size-4" />
                  {t('common.back')}
                </Button>
              )}
              {!last && (
                <Button className="h-9 gap-1.5 px-4" onClick={next}>
                  {index === 0 ? t('welcome.getStarted') : t('common.next')}
                  <ArrowRight className="size-4" />
                </Button>
              )}
            </div>
          </div>
          {/* fixed height so the column never jumps when the final call-to-action appears */}
          <div className="mt-5 h-10">
            <AnimatePresence>
              {last && (
                <motion.div
                  className="flex gap-2"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ delay: 0.1, duration: 0.3, ease: EASE }}
                >
                  <Button className="h-10 flex-1 gap-2 px-4" onClick={() => onDone('tour')}>
                    <Sparkles className="size-4" />
                    {t('welcome.takeTour')}
                  </Button>
                  <Button variant="outline" className="h-10 flex-1 px-4" onClick={() => onDone('explore')}>
                    {t('welcome.exploreOwn')}
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* screenshot */}
        <div className="relative hidden min-w-0 lg:block">
          <div className="pointer-events-none absolute -inset-10 rounded-[48px] bg-gradient-to-br from-violet-500/25 via-sky-400/15 to-transparent blur-3xl dark:from-violet-500/20 dark:via-sky-500/10" />
          <div className="relative aspect-[16/10] w-full">
            <AnimatePresence initial={false} custom={direction}>
              <motion.div
                key={slide.id}
                custom={direction}
                className="absolute inset-0 overflow-hidden rounded-xl border bg-card shadow-[0_40px_80px_-24px_rgba(0,0,0,0.35),0_8px_24px_-8px_rgba(0,0,0,0.15)] ring-1 ring-black/5 dark:shadow-[0_40px_80px_-24px_rgba(0,0,0,0.8)] dark:ring-white/10"
                variants={{
                  enter: (d: number) => ({ opacity: 0, x: 40 * d, scale: 0.98 }),
                  center: { opacity: 1, x: 0, scale: 1 },
                  exit: (d: number) => ({ opacity: 0, x: -40 * d, scale: 0.98 })
                }}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.45, ease: EASE }}
              >
                <img src={slide.image[theme]} alt={t(slide.image.alt)} className="size-full object-cover object-left-top" draggable={false} />
              </motion.div>
            </AnimatePresence>
            <AnimatePresence>
              {slide.id === 'ai' && (
                <motion.div
                  key="mcp"
                  className="absolute -bottom-6 -left-6 max-w-[88%] rounded-xl border bg-popover/95 p-3 pr-4 shadow-[0_20px_40px_-12px_rgba(0,0,0,0.35)] backdrop-blur"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ delay: 0.25, duration: 0.4, ease: EASE }}
                >
                  <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
                    <span className="size-1.5 rounded-full bg-emerald-500 shadow-[0_0_0_3px] shadow-emerald-500/20" />
                    {t('welcome.mcpServer')} · 127.0.0.1:{port}
                  </div>
                  <code className="mt-1.5 block truncate font-mono text-[11px] text-foreground/90">
                    <span className="text-muted-foreground">$ </span>claude mcp add --transport http {slug} http://127.0.0.1:{port}/mcp
                  </code>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </motion.div>,
    document.body
  )
}

/** First step: Deutsch / English. Switches the whole UI immediately (stored per account). */
function LanguagePicker() {
  const dispatch = useAppDispatch()
  const lang = useLang()
  return (
    <div className="mt-7 grid grid-cols-2 gap-3" role="radiogroup" aria-label={t('lang.label')}>
      {LANGS.map((l) => (
        <button
          key={l}
          role="radio"
          aria-checked={lang === l}
          onClick={() => void dispatch(updateSettings({ language: l }))}
          className={cn(
            'flex h-12 items-center justify-between rounded-xl border bg-card px-4 text-left text-[14px] font-medium shadow-xs transition hover:bg-accent',
            lang === l && 'border-foreground/50 ring-1 ring-foreground/15'
          )}
        >
          {LANG_NAMES[l]}
          {lang === l && <Check className="size-4" />}
        </button>
      ))}
    </div>
  )
}

/** Soft colour wash + fading dot grid behind the slides. */
function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="absolute -top-40 right-[-10%] h-[520px] w-[720px] rounded-full bg-violet-400/15 blur-[120px] dark:bg-violet-600/15" />
      <div className="absolute bottom-[-20%] left-[20%] h-[480px] w-[640px] rounded-full bg-sky-300/15 blur-[120px] dark:bg-sky-600/10" />
      <div
        className="absolute inset-0 opacity-[0.5] dark:opacity-[0.35]"
        style={{
          backgroundImage: 'radial-gradient(color-mix(in oklch, var(--foreground) 14%, transparent) 1px, transparent 1px)',
          backgroundSize: '22px 22px',
          maskImage: 'radial-gradient(ellipse 70% 60% at 60% 45%, black, transparent)'
        }}
      />
    </div>
  )
}

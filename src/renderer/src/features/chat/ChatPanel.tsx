import { ArrowUp, ChevronDown, Globe, KeyRound, RotateCcw, Square, Wrench, X } from '@/components/icons'
import { motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { toast } from 'sonner'
import { AI_PROVIDERS, getProviderMeta, mergeSources, supportsWebSearch } from '@shared/ai'
import type { AskUserAnswer, AskUserQuestion, ChatEvent, ChatSource } from '@shared/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Orb } from '@/components/Orb'
import { t, type MessageKey } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store'
import { api } from '@/store/api'
import { updateSettings } from '@/store/settings'
import { clearQueuedChatMessage, setChatOpen, setSettingsOpen, setSettingsSection } from '@/store/ui'
import { AskUserQuestions } from './AskUserQuestions'

interface AskEntry {
  requestId: string
  questions: AskUserQuestion[]
  answers?: AskUserAnswer[] | 'skipped'
}

interface Msg {
  role: 'user' | 'assistant'
  text: string
  tools: string[]
  asks: AskEntry[]
  /** Native web searches in this message (query/error filled in as they arrive). */
  searches?: { query?: string; error?: string }[]
  sources?: ChatSource[]
  error?: string
}

/** Apply a streamed `search` event to a message's search list. Pure. */
function applySearch(list: NonNullable<Msg['searches']>, e: Extract<ChatEvent, { type: 'search' }>): NonNullable<Msg['searches']> {
  const out = [...list]
  const last = out[out.length - 1]
  if (e.error) {
    if (last && !last.error) out[out.length - 1] = { ...last, error: e.error }
    else out.push({ error: e.error })
  } else if (e.query) {
    if (last && !last.query && !last.error) out[out.length - 1] = { ...last, query: e.query }
    else out.push({ query: e.query })
  } else out.push({})
  return out
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url)
}

const SUGGESTIONS: MessageKey[] = ['chat.suggest.week', 'chat.suggest.summarize', 'chat.suggest.group', 'chat.suggest.todo']

export function ChatPanel() {
  const dispatch = useAppDispatch()
  const queuedChatMessage = useAppSelector((s) => s.ui.queuedChatMessage)
  const ai = useAppSelector((s) => s.settings.ai)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [hasKey, setHasKey] = useState<boolean | null>(null)
  const [key, setKey] = useState('')
  const scroller = useRef<HTMLDivElement>(null)
  const prevProvider = useRef(ai.provider)

  useEffect(() => void window.chat.hasKey().then(setHasKey), [ai.provider, ai.model, ai.baseUrl])

  // Dev-only: lets devShot scripts render `ask_user_questions` without a real model call —
  // `window.__devAskUser(questions)` injects a fake `ask` event into the message stream.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    ;(window as unknown as { __devAskUser?: (questions: AskUserQuestion[]) => void }).__devAskUser = (questions) => {
      setHasKey(true)
      setMessages((ms) => [...ms, { role: 'assistant', text: '', tools: [], asks: [{ requestId: `dev-${ms.length}`, questions }] }])
    }
  }, [])

  // Dev-only: `window.__devChatMessage(user, assistant)` appends a fake exchange (e.g. with web sources) for devShot.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    ;(window as unknown as { __devChatMessage?: (user: string, assistant: Partial<Msg>) => void }).__devChatMessage = (user, assistant) => {
      setHasKey(true)
      setMessages((ms) => [...ms, { role: 'user', text: user, tools: [], asks: [] }, { role: 'assistant', text: '', tools: [], asks: [], ...assistant }])
    }
  }, [])

  // Switching provider starts a new conversation (the main-process agent resets its own history too).
  useEffect(() => {
    if (prevProvider.current === ai.provider) return
    prevProvider.current = ai.provider
    setMessages([])
    setBusy(false)
    toast(t('chat.switched', { provider: getProviderMeta(ai.provider).label }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ai.provider])

  useEffect(
    () =>
      window.chat.onEvent((e) => {
        setMessages((ms) => {
          const last = ms[ms.length - 1]
          if (!last || last.role !== 'assistant') return ms
          const next = { ...last }
          if (e.type === 'text') next.text += e.delta
          else if (e.type === 'tool') next.tools = [...next.tools, e.name]
          else if (e.type === 'search') next.searches = applySearch(next.searches ?? [], e)
          else if (e.type === 'sources') next.sources = mergeSources(next.sources ?? [], e.sources)
          else if (e.type === 'ask') next.asks = [...next.asks, { requestId: e.requestId, questions: e.questions }]
          else if (e.type === 'error') next.error = e.message
          return [...ms.slice(0, -1), next]
        })
        if (e.type === 'done' || e.type === 'error') {
          setBusy(false)
          dispatch(api.util.invalidateTags(['Card', 'CardList', 'Tag', 'Whiteboard', 'Kanban']))
        }
      }),
    [dispatch]
  )

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight })
  }, [messages])

  const send = (text: string) => {
    const value = text.trim()
    if (!value || busy) return
    setInput('')
    setBusy(true)
    setMessages((ms) => [...ms, { role: 'user', text: value, tools: [], asks: [] }, { role: 'assistant', text: '', tools: [], asks: [] }])
    void window.chat.send(value)
  }

  const setAskAnswers = (requestId: string, answers: AskEntry['answers']) => {
    setMessages((ms) => ms.map((m) => (m.asks.some((a) => a.requestId === requestId) ? { ...m, asks: m.asks.map((a) => (a.requestId === requestId ? { ...a, answers } : a)) } : m)))
  }

  const submitAnswers = (requestId: string, answers: AskUserAnswer[]) => {
    setAskAnswers(requestId, answers)
    void window.chat.answerQuestions(requestId, answers)
  }

  const skipAnswers = (requestId: string) => {
    setAskAnswers(requestId, 'skipped')
    void window.chat.skipQuestions(requestId)
  }

  // Consume a message queued by another part of the app (e.g. "Organize with AI") once we can actually send it.
  useEffect(() => {
    if (!queuedChatMessage || hasKey !== true || busy) return
    dispatch(clearQueuedChatMessage())
    send(queuedChatMessage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queuedChatMessage, hasKey, busy])

  return (
    <motion.aside
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 380, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 420, damping: 40 }}
      className="h-full shrink-0 overflow-hidden border-l bg-background"
    >
      <div className="flex h-full w-[380px] flex-col">
        <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
          <Orb online={!!hasKey} active={busy} />
          <Popover>
            <PopoverTrigger asChild>
              <button className="flex min-w-0 items-center gap-1 rounded-md px-1 py-0.5 text-sm font-medium transition hover:bg-accent">
                <span className="truncate">{getProviderMeta(ai.provider).label}</span>
                <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 p-1.5">
              <div className="px-1.5 py-1 text-xs text-muted-foreground">{ai.model}</div>
              {AI_PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    if (p.id !== ai.provider) dispatch(updateSettings({ ai: { provider: p.id, model: p.defaultModels[0] ?? '' } }))
                  }}
                  className={cn('flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition hover:bg-accent', p.id === ai.provider && 'bg-accent font-medium')}
                >
                  {p.label}
                </button>
              ))}
              <div className="mt-1 border-t pt-1">
                <button
                  onClick={() => (dispatch(setSettingsSection('ai')), dispatch(setSettingsOpen(true)))}
                  className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground"
                >
                  {t('chat.moreProviders')}
                </button>
              </div>
            </PopoverContent>
          </Popover>
          <div className="flex-1" />
          <Button variant="ghost" size="icon" className="size-7" title={t('chat.newConversation')} onClick={() => (void window.chat.reset(), setMessages([]), setBusy(false))}>
            <RotateCcw className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="size-7" title={t('settings.ai.apiKey')} onClick={() => setHasKey(false)}>
            <KeyRound className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="size-7" aria-label={t('common.close')} onClick={() => dispatch(setChatOpen(false))}>
            <X className="size-4" />
          </Button>
        </div>

        {hasKey === false ? (
          <form
            className="flex flex-1 flex-col justify-center gap-3 p-6"
            onSubmit={async (e) => {
              e.preventDefault()
              try {
                await window.chat.setKey(key)
                setKey('')
                setHasKey(await window.chat.hasKey())
                toast.success(t('chat.keySaved'))
              } catch (err) {
                toast.error(String(err))
              }
            }}
          >
            <div className="mx-auto mb-2">
              <Orb online={false} active={false} className="size-10 [&>span]:size-8" />
            </div>
            <h3 className="text-center font-medium">{t('chat.connect', { provider: getProviderMeta(ai.provider).label })}</h3>
            <p className="text-center text-sm text-muted-foreground">
              {ai.provider === 'anthropic' ? t('chat.keyAnthropic') : t('chat.keyOther', { provider: getProviderMeta(ai.provider).label })}
            </p>
            <Input type="password" placeholder={getProviderMeta(ai.provider).keyPlaceholder} value={key} onChange={(e) => setKey(e.target.value)} autoFocus />
            <Button type="submit" disabled={!key.trim()}>
              {t('chat.saveKey')}
            </Button>
            <button
              type="button"
              onClick={() => (dispatch(setSettingsSection('ai')), dispatch(setSettingsOpen(true)))}
              className="text-center text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              {t('chat.otherProvider')}
            </button>
          </form>
        ) : (
          <>
            <div ref={scroller} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
              {messages.length === 0 && (
                <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                  <Orb online active={false} className="size-12 [&>span]:size-10" />
                  <p className="text-sm text-muted-foreground">{t('chat.emptyHint')}</p>
                  <div className="flex w-full flex-col gap-1.5">
                    {SUGGESTIONS.map((s) => (
                      <button key={s} onClick={() => send(t(s))} className="rounded-lg border px-3 py-2 text-left text-sm transition hover:bg-accent">
                        {t(s)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((m, i) =>
                m.role === 'user' ? (
                  <div key={i} className="ml-8 rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-sm whitespace-pre-wrap text-primary-foreground">
                    {m.text}
                  </div>
                ) : (
                  <div key={i} className="space-y-2 text-sm">
                    {m.tools.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {m.tools.map((tool, k) => (
                          <span key={k} className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                            <Wrench className="size-3" /> {tool}
                          </span>
                        ))}
                      </div>
                    )}
                    {!!m.searches?.length && (
                      <div className="flex flex-wrap gap-1">
                        {m.searches.map((q, k) => (
                          <span
                            key={k}
                            className={cn('inline-flex max-w-full items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground', q.error && 'text-destructive')}
                          >
                            <Globe className="size-3 shrink-0" />
                            <span className="truncate">
                              {q.error ? q.error : q.query ? t('chat.searched', { query: q.query }) : busy && i === messages.length - 1 ? t('chat.searching') : t('chat.searchedWeb')}
                            </span>
                          </span>
                        ))}
                      </div>
                    )}
                    {m.text && (
                      <div className="prose-canvas chat-markdown text-sm">
                        <Markdown remarkPlugins={[remarkGfm]}>{m.text}</Markdown>
                      </div>
                    )}
                    {!!m.sources?.length && (
                      <div className="space-y-1">
                        <div className="text-[11px] font-medium text-muted-foreground">{t('chat.sources')}</div>
                        <ol className="flex flex-col gap-0.5">
                          {m.sources.filter((src) => isHttpUrl(src.url)).map((src, k) => (
                            <li key={src.url}>
                              <a
                                href={src.url}
                                target="_blank"
                                rel="noreferrer noopener"
                                title={src.citedText ? `“${src.citedText}”\n${src.url}` : src.url}
                                className="flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-xs transition hover:bg-accent"
                              >
                                <span className="flex size-4 shrink-0 items-center justify-center rounded bg-muted font-mono text-[10px] text-muted-foreground">{k + 1}</span>
                                <span className="shrink-0 text-muted-foreground">{hostOf(src.url)}</span>
                                {src.title && <span className="min-w-0 truncate">{src.title}</span>}
                              </a>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                    {m.asks.map((a) => (
                      <AskUserQuestions key={a.requestId} requestId={a.requestId} questions={a.questions} answers={a.answers} onSubmit={submitAnswers} onSkip={skipAnswers} />
                    ))}
                    {!m.text && !m.asks.length && !m.error && busy && i === messages.length - 1 && (
                      <div className="flex gap-1 py-1">
                        {[0, 1, 2].map((d) => (
                          <motion.span key={d} className="size-1.5 rounded-full bg-muted-foreground/60" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: d * 0.15 }} />
                        ))}
                      </div>
                    )}
                    {m.error && <p className="rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">{m.error}</p>}
                  </div>
                )
              )}
            </div>
            <form
              className="border-t p-3"
              onSubmit={(e) => {
                e.preventDefault()
                send(input)
              }}
            >
              <div className="flex items-end gap-2 rounded-xl border bg-card p-2 focus-within:ring-2 focus-within:ring-ring/20">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      send(input)
                    }
                  }}
                  rows={Math.min(6, Math.max(1, input.split('\n').length))}
                  placeholder={t('chat.placeholder')}
                  className="max-h-40 min-h-6 flex-1 resize-none bg-transparent px-1 text-sm outline-none"
                />
                <WebSearchToggle />
                {busy ? (
                  <Button type="button" size="icon" variant="secondary" className="size-7 rounded-lg" onClick={() => void window.chat.stop()}>
                    <Square className="size-3" />
                  </Button>
                ) : (
                  <Button type="submit" size="icon" className={cn('size-7 rounded-lg', !input.trim() && 'opacity-40')}>
                    <ArrowUp className="size-4" />
                  </Button>
                )}
              </div>
            </form>
          </>
        )}
      </div>
    </motion.aside>
  )
}

/** Composer toggle for `AppSettings.ai.webSearch` — only usable with providers that have native web search. */
function WebSearchToggle() {
  const dispatch = useAppDispatch()
  const ai = useAppSelector((s) => s.settings.ai)
  const supported = supportsWebSearch(ai.provider)
  const on = supported && ai.webSearch
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label={t('chat.allowWeb')}
          aria-pressed={on}
          aria-disabled={!supported}
          data-web-search={supported ? (on ? 'on' : 'off') : 'disabled'}
          onClick={() => supported && dispatch(updateSettings({ ai: { webSearch: !ai.webSearch } }))}
          className={cn(
            'h-7 gap-1 rounded-lg px-1.5 text-xs text-muted-foreground',
            on && 'bg-primary/10 text-foreground hover:bg-primary/15 dark:bg-primary/15 dark:hover:bg-primary/20',
            !supported && 'cursor-not-allowed opacity-40 hover:bg-transparent hover:text-muted-foreground dark:hover:bg-transparent'
          )}
        >
          <Globe className="size-4" />
          {on && <span>{t('chat.web')}</span>}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">
        {supported ? (on ? t('chat.webOn') : t('chat.allowWeb')) : t('chat.webUnsupported')}
      </TooltipContent>
    </Tooltip>
  )
}

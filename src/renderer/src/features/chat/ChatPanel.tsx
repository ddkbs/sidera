import { ArrowUp, ChevronDown, KeyRound, RotateCcw, Square, Wrench, X } from '@/components/icons'
import { motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { toast } from 'sonner'
import { AI_PROVIDERS, getProviderMeta } from '@shared/ai'
import type { AskUserAnswer, AskUserQuestion } from '@shared/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Orb } from '@/components/Orb'
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
  error?: string
}

const SUGGESTIONS = [
  'What did I work on this week?',
  'Summarize my #Research cards',
  'Create a whiteboard that groups my cards by topic',
  'Add a to-do for tomorrow to my Inbox'
]

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

  // Switching provider starts a new conversation (the main-process agent resets its own history too).
  useEffect(() => {
    if (prevProvider.current === ai.provider) return
    prevProvider.current = ai.provider
    setMessages([])
    setBusy(false)
    toast(`Switched to ${getProviderMeta(ai.provider).label} — started a new conversation`)
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
    const t = text.trim()
    if (!t || busy) return
    setInput('')
    setBusy(true)
    setMessages((ms) => [...ms, { role: 'user', text: t, tools: [], asks: [] }, { role: 'assistant', text: '', tools: [], asks: [] }])
    void window.chat.send(t)
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
                  More providers & models…
                </button>
              </div>
            </PopoverContent>
          </Popover>
          <div className="flex-1" />
          <Button variant="ghost" size="icon" className="size-7" title="New conversation" onClick={() => (void window.chat.reset(), setMessages([]), setBusy(false))}>
            <RotateCcw className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="size-7" title="API key" onClick={() => setHasKey(false)}>
            <KeyRound className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="size-7" onClick={() => dispatch(setChatOpen(false))}>
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
                toast.success('API key saved to your Keychain')
              } catch (err) {
                toast.error(String(err))
              }
            }}
          >
            <div className="mx-auto mb-2">
              <Orb online={false} active={false} className="size-10 [&>span]:size-8" />
            </div>
            <h3 className="text-center font-medium">Connect {getProviderMeta(ai.provider).label}</h3>
            <p className="text-center text-sm text-muted-foreground">
              {ai.provider === 'anthropic'
                ? "The assistant uses your own Anthropic API key. It's encrypted with the macOS Keychain and never leaves this Mac except to call the API."
                : `Add your ${getProviderMeta(ai.provider).label} API key, encrypted with the macOS Keychain.`}
            </p>
            <Input type="password" placeholder={getProviderMeta(ai.provider).keyPlaceholder} value={key} onChange={(e) => setKey(e.target.value)} autoFocus />
            <Button type="submit" disabled={!key.trim()}>
              Save key
            </Button>
            <button
              type="button"
              onClick={() => (dispatch(setSettingsSection('ai')), dispatch(setSettingsOpen(true)))}
              className="text-center text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              Use a different provider (OpenAI, Gemini, Ollama, …) in Settings
            </button>
          </form>
        ) : (
          <>
            <div ref={scroller} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
              {messages.length === 0 && (
                <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                  <Orb online active={false} className="size-12 [&>span]:size-10" />
                  <p className="text-sm text-muted-foreground">Ask about your knowledge base, or let the assistant organize it.</p>
                  <div className="flex w-full flex-col gap-1.5">
                    {SUGGESTIONS.map((s) => (
                      <button key={s} onClick={() => send(s)} className="rounded-lg border px-3 py-2 text-left text-sm transition hover:bg-accent">
                        {s}
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
                        {m.tools.map((t, k) => (
                          <span key={k} className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                            <Wrench className="size-3" /> {t}
                          </span>
                        ))}
                      </div>
                    )}
                    {m.text && (
                      <div className="prose-canvas chat-markdown text-sm">
                        <Markdown remarkPlugins={[remarkGfm]}>{m.text}</Markdown>
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
                  placeholder="Ask or instruct…"
                  className="max-h-40 min-h-6 flex-1 resize-none bg-transparent px-1 text-sm outline-none"
                />
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

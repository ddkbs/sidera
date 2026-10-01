import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import type { BoardRef } from '@shared/sync/protocol'
import { Redo2, Tablet, Undo2, WifiOff } from '@/components/icons'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { WhiteboardView } from '@/features/canvas/WhiteboardView'
import { useAppearance } from '@/lib/appearance'
import { redo, undo, useUndoState } from '@/lib/undo'
import { cn } from '@/lib/utils'
import { store, useAppDispatch } from '@/store'
import { api, scopeTags } from '@/store/api'
import { settingsLoaded } from '@/store/settings'
import type { Launch } from './boot'
import { pair, type ConnectionState } from './client'
import { credentialFragment, isStandalone, saveCredential } from './credentials'

export function renderIpad(launch: Launch): void {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Provider store={store}>
        <TooltipProvider delayDuration={300}>
          <IpadApp launch={launch} />
        </TooltipProvider>
      </Provider>
    </StrictMode>
  )
}

type Phase =
  | { kind: 'pairing' }
  | { kind: 'paired'; host: string }
  | { kind: 'unpaired'; message?: string }
  | { kind: 'live' }

function IpadApp({ launch }: { launch: Launch }) {
  const { client } = launch
  const dispatch = useAppDispatch()
  const theme = useAppearance()
  const [phase, setPhase] = useState<Phase>(() => (launch.pairing ? { kind: 'pairing' } : launch.credential ? { kind: 'live' } : { kind: 'unpaired' }))
  const [conn, setConn] = useState<ConnectionState>(client.state)
  const [board, setBoard] = useState<BoardRef | null>(client.board)

  useEffect(() => {
    let triedFallback = false
    const offs = [
      client.on('board', setBoard),
      client.on('state', (s, reason) => {
        setConn(s)
        if (s !== 'rejected') return
        if (launch.fallback && !triedFallback) {
          triedFallback = true
          saveCredential(launch.fallback)
          return client.start(launch.fallback)
        }
        setPhase({ kind: 'unpaired', message: reason === 'unknown-device' ? 'This iPad is no longer paired with the account that is signed in on your Mac.' : undefined })
      }),
      window.app.onSettingsChanged((s) => dispatch(settingsLoaded(s))),
      // pushes from the Mac (its own edits, MCP, other devices) → refetch what is on screen
      window.events.onDbChanged((scopes) => void dispatch(api.util.invalidateTags([...new Set(scopes.flatMap((sc) => scopeTags[sc]))])))
    ]
    void window.app.getSettings().then((s) => dispatch(settingsLoaded(s)))

    if (launch.pairing) {
      const { id, key } = launch.pairing
      pair(id, key, launch.deviceName)
        .then(({ credential, host }) => {
          saveCredential(credential)
          client.start(credential)
          if (isStandalone()) setPhase({ kind: 'live' })
          else {
            // "Add to Home Screen" bookmarks this URL: the home-screen app (separate storage) adopts the credential
            history.replaceState(null, '', location.pathname + credentialFragment(credential))
            setPhase({ kind: 'paired', host })
          }
        })
        .catch((e: Error) =>
          setPhase({
            kind: 'unpaired',
            message: e.message === 'pairing-expired' ? 'That QR code has expired or was already used. Show a new one on your Mac.' : 'Pairing failed. Make sure the iPad is on the same Wi-Fi as your Mac and try again.'
          })
        )
    } else if (launch.credential) client.start()
    return () => offs.forEach((off) => off())
  }, [client, dispatch, launch])

  if (phase.kind === 'pairing') return <Screen title="Pairing with your Mac…" />
  if (phase.kind === 'unpaired')
    return (
      <Screen title="Connect this iPad to Sidera">
        {phase.message && <p className="text-destructive">{phase.message}</p>}
        <p>On your Mac, open a whiteboard and click the iPad button in its top-right corner, then scan the QR code with the iPad camera.</p>
      </Screen>
    )
  if (phase.kind === 'paired')
    return (
      <Screen title={`Paired with ${phase.host}`}>
        <p>
          For the full-screen app, tap <b>Share</b> → <b>Add to Home Screen</b> now. From then on, open Sidera from your Home Screen — it reconnects
          automatically whenever a whiteboard is shared from your Mac.
        </p>
        <button className="mt-2 rounded-xl bg-primary px-4 py-2 text-primary-foreground" onClick={() => setPhase({ kind: 'live' })}>
          Continue in Safari
        </button>
      </Screen>
    )

  return (
    <div className="fixed inset-0 flex flex-col bg-background text-foreground">
      <StatusBar conn={conn} board={board} host={client.host} />
      <main className="relative min-h-0 flex-1">
        {board ? (
          <WhiteboardView key={board.id} id={board.id} />
        ) : (
          <Screen title="Waiting for your Mac" inline>
            <p>
              {conn === 'connected'
                ? 'Click the iPad button on a whiteboard on your Mac — it shows up here right away.'
                : 'Open Sidera on your Mac and click the iPad button on a whiteboard. This iPad reconnects by itself.'}
            </p>
          </Screen>
        )}
      </main>
      <Toaster theme={theme} position="bottom-center" />
    </div>
  )
}

function StatusBar({ conn, board, host }: { conn: ConnectionState; board: BoardRef | null; host: string }) {
  const { undo: canUndo, redo: canRedo } = useUndoState()
  const live = conn === 'connected'
  return (
    <header className="flex shrink-0 items-center gap-2 border-b bg-popover/95 px-3 pt-[env(safe-area-inset-top)] backdrop-blur" style={{ minHeight: 44 }}>
      <span className={cn('size-2 shrink-0 rounded-full', live ? 'bg-emerald-500' : 'animate-pulse bg-amber-500')} />
      <span className="min-w-0 truncate text-sm font-medium">{board?.name ?? 'Sidera'}</span>
      <span className="shrink-0 text-xs text-muted-foreground">
        {live ? (host ? `· ${host}` : '') : conn === 'connecting' ? '· Connecting…' : '· Reconnecting…'}
      </span>
      {!live && <WifiOff className="size-4 shrink-0 text-amber-500" />}
      <div className="ml-auto flex items-center gap-1">
        <button aria-label="Undo" disabled={!canUndo} onClick={() => void undo()} className="grid size-9 place-items-center rounded-lg disabled:opacity-30">
          <Undo2 className="size-5" />
        </button>
        <button aria-label="Redo" disabled={!canRedo} onClick={() => void redo()} className="grid size-9 place-items-center rounded-lg disabled:opacity-30">
          <Redo2 className="size-5" />
        </button>
      </div>
    </header>
  )
}

function Screen({ title, children, inline }: { title: string; children?: React.ReactNode; inline?: boolean }) {
  return (
    <div className={cn('grid place-items-center bg-background p-8 text-foreground', inline ? 'h-full' : 'fixed inset-0')}>
      <div className="flex max-w-md flex-col items-center gap-3 text-center text-sm text-muted-foreground">
        <div className="grid size-14 place-items-center rounded-2xl bg-muted text-foreground">
          <Tablet className="size-7" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">{title}</h1>
        {children}
      </div>
    </div>
  )
}

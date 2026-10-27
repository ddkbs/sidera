import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import type { BoardRef } from '@shared/sync/protocol'
import { Redo2, Tablet, Undo2, WifiOff } from '@/components/icons'
import { Logo } from '@/components/Logo'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { WhiteboardView } from '@/features/canvas/WhiteboardView'
import { useAppearance } from '@/lib/appearance'
import { resolveUiLang, setLang, t, tRich, useLang } from '@/lib/i18n'
import { redo, undo, useUndoState } from '@/lib/undo'
import { cn } from '@/lib/utils'
import { store, useAppDispatch } from '@/store'
import { api, scopeTags } from '@/store/api'
import { settingsLoaded } from '@/store/settings'
import type { Launch } from './boot'
import { pair, type ConnectionState } from './client'
import { credentialFragment, isStandalone, saveCredential } from './credentials'

export function renderIpad(launch: Launch): void {
  // the Mac sends its UI language with the mirrored settings; until then: last used / the iPad's own language
  store.subscribe(() => {
    const pref = store.getState().settings.language
    if (pref) setLang(resolveUiLang(pref))
  })
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
  useLang()
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
        setPhase({ kind: 'unpaired', message: reason === 'unknown-device' ? t('ipadApp.unknownDevice') : undefined })
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
            // a home-screen icon added before pairing finished would reopen the used QR link forever
            message:
              e.message === 'pairing-expired'
                ? isStandalone()
                  ? t('ipadApp.reAddHome')
                  : t('ipadApp.qrExpired')
                : t('ipadApp.pairFailed')
          })
        )
    } else if (launch.credential) {
      // keep the credential in Safari's address so "Add to Home Screen" always bookmarks a working URL
      if (!isStandalone()) history.replaceState(null, '', location.pathname + credentialFragment(launch.credential))
      client.start()
    }
    return () => offs.forEach((off) => off())
  }, [client, dispatch, launch])

  if (phase.kind === 'pairing') return <Screen title={t('ipadApp.pairing')} />
  if (phase.kind === 'unpaired')
    return (
      <Screen title={t('ipadApp.connectTitle')}>
        {phase.message && <p className="text-destructive">{phase.message}</p>}
        <p>{t('ipadApp.connectBody')}</p>
      </Screen>
    )
  if (phase.kind === 'paired')
    return (
      <Screen title={t('ipadApp.pairedWith', { host: phase.host })}>
        <p>{tRich('ipadApp.homeScreen', { share: <b>{t('ipadApp.share')}</b>, add: <b>{t('ipadApp.addHome')}</b> })}</p>
        <button className="mt-2 rounded-xl bg-primary px-4 py-2 text-primary-foreground" onClick={() => setPhase({ kind: 'live' })}>
          {t('ipadApp.continueSafari')}
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
          <Screen title={t('ipadApp.waiting')} inline>
            <p>{conn === 'connected' ? t('ipadApp.waitingConnected') : t('ipadApp.waitingOffline')}</p>
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
  const status = live ? t('ipadApp.live') : conn === 'connecting' ? t('ipadApp.connecting') : t('ipadApp.reconnecting')
  return (
    <header className="relative flex shrink-0 items-center gap-3 bg-popover/85 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-xl" style={{ minHeight: 52 }}>
      <Logo className="size-[22px] shrink-0 text-foreground" />
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="shrink-0 text-[13px] text-muted-foreground">Sidera</span>
        <span className="shrink-0 text-[13px] text-muted-foreground/50">/</span>
        <span className="min-w-0 truncate text-[15px] font-semibold tracking-[-0.01em]">{board?.name ?? '—'}</span>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <div
          className={cn(
            'flex h-8 items-center gap-2 rounded-full border px-3 font-mono text-[10.5px] uppercase tracking-[0.14em]',
            live ? 'border-foreground/10 text-muted-foreground' : 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'
          )}
        >
          <span className={cn('size-1.5 shrink-0 rounded-full', live ? 'bg-emerald-500 shadow-[0_0_8px_rgb(16_185_129)]' : 'animate-pulse bg-amber-500')} />
          <span className="whitespace-nowrap">{status}</span>
          {live && host && <span className="max-w-[18ch] truncate normal-case tracking-normal text-muted-foreground/70">{`· ${host}`}</span>}
          {!live && <WifiOff className="size-3.5 shrink-0" />}
        </div>
        <div className="flex h-9 items-center rounded-xl border border-foreground/10 bg-foreground/[0.03] p-0.5">
          <button aria-label={t('common.undo')} disabled={!canUndo} onClick={() => void undo()} className="grid h-8 w-10 place-items-center rounded-[9px] transition-colors active:bg-foreground/10 disabled:opacity-30">
            <Undo2 className="size-[18px]" />
          </button>
          <span className="h-4 w-px bg-foreground/10" />
          <button aria-label={t('cmd.edit.redo')} disabled={!canRedo} onClick={() => void redo()} className="grid h-8 w-10 place-items-center rounded-[9px] transition-colors active:bg-foreground/10 disabled:opacity-30">
            <Redo2 className="size-[18px]" />
          </button>
        </div>
      </div>
      {/* dashed drafting rule, like the product site */}
      <div className="absolute inset-x-0 bottom-0 h-px bg-[linear-gradient(to_right,var(--border)_50%,transparent_50%)] bg-[length:8px_1px] bg-repeat-x" />
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

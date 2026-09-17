import { useEffect, useRef, useState } from 'react'
import { ArrowHeadBoth, ArrowHeadEnd, ArrowHeadNone, LineDotted, LineSolid, Trash2 } from '@/components/icons'
import { PALETTE } from '@/lib/colors'
import { cn } from '@/lib/utils'
import type { ArrowEnds, Connection, LineStyle } from '@shared/types'

export interface ConnectionPatch {
  label?: string
  color?: string | null
  lineStyle?: LineStyle
  arrows?: ArrowEnds
}

interface Props {
  connection: Connection
  /** Position inside the canvas wrapper. */
  x: number
  y: number
  onChange: (patch: ConnectionPatch) => void
  onDelete: () => void
  onClose: () => void
}

const LINE_STYLES: { value: LineStyle; label: string; icon: typeof LineSolid }[] = [
  { value: 'solid', label: 'Solid line', icon: LineSolid },
  { value: 'dashed', label: 'Dashed line', icon: LineDotted }
]

const ARROWS: { value: ArrowEnds; label: string; icon: typeof LineSolid }[] = [
  { value: 'none', label: 'No arrow', icon: ArrowHeadNone },
  { value: 'end', label: 'Arrow at the end', icon: ArrowHeadEnd },
  { value: 'both', label: 'Arrows at both ends', icon: ArrowHeadBoth }
]

/** Compact popover on a selected connection: label, colour, line style, arrow ends, delete. */
export function EdgeMenu({ connection, x, y, onChange, onDelete, onClose }: Props) {
  const [label, setLabel] = useState(connection.label)
  const root = useRef<HTMLDivElement>(null)
  const labelRef = useRef(label)
  labelRef.current = label

  useEffect(() => setLabel(connection.label), [connection.id, connection.label])

  useEffect(() => {
    const commit = (): void => {
      if (labelRef.current.trim() !== connection.label) onChange({ label: labelRef.current.trim() })
    }
    const onDown = (e: MouseEvent): void => {
      if (root.current?.contains(e.target as Node)) return
      commit()
      onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
    }
    document.addEventListener('mousedown', onDown, true)
    window.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [connection.id, connection.label, onChange, onClose])

  return (
    <div
      ref={root}
      data-testid="edge-menu"
      style={{ left: x, top: y }}
      className="absolute z-20 w-60 -translate-x-1/2 space-y-2 rounded-xl border bg-popover p-2 shadow-[0_8px_30px_-6px_rgba(0,0,0,0.25)]"
    >
      <input
        autoFocus
        value={label}
        placeholder="Label"
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            onChange({ label: label.trim() })
            onClose()
          }
        }}
        className="h-8 w-full rounded-md border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-brand/40"
      />
      <div className="flex flex-wrap items-center gap-1">
        <button
          aria-label="Default colour"
          title="Default"
          onClick={() => onChange({ color: null })}
          className={cn('size-5 rounded-full border bg-muted', !connection.color && 'ring-2 ring-foreground/40')}
        />
        {Object.keys(PALETTE).map((name) => (
          <button
            key={name}
            aria-label={name}
            title={name}
            onClick={() => onChange({ color: name })}
            className={cn('size-5 rounded-full border border-transparent', connection.color === name && 'ring-2 ring-foreground/40')}
            style={{ background: PALETTE[name].fg }}
          />
        ))}
      </div>
      <div className="flex items-center gap-1">
        <Group>
          {LINE_STYLES.map((s) => (
            <Choice key={s.value} label={s.label} active={connection.lineStyle === s.value} onClick={() => onChange({ lineStyle: s.value })}>
              <s.icon size={16} />
            </Choice>
          ))}
        </Group>
        <Group>
          {ARROWS.map((a) => (
            <Choice key={a.value} label={a.label} active={connection.arrows === a.value} onClick={() => onChange({ arrows: a.value })}>
              <a.icon size={16} />
            </Choice>
          ))}
        </Group>
        <button
          aria-label="Delete connection"
          title="Delete connection"
          onClick={onDelete}
          className="ml-auto grid size-7 place-items-center rounded-md text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
    </div>
  )
}

const Group = ({ children }: { children: React.ReactNode }): React.ReactElement => (
  <div className="flex items-center gap-0.5 rounded-md border p-0.5">{children}</div>
)

function Choice({ label, active, onClick, children }: { label: string; active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn('grid size-6 place-items-center rounded text-muted-foreground transition hover:bg-accent hover:text-foreground', active && 'bg-accent text-foreground')}
    >
      {children}
    </button>
  )
}

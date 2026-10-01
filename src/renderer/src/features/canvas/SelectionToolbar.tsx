import { useViewport } from '@xyflow/react'
import {
  AlignBottom,
  AlignCenterH,
  AlignLeft,
  AlignMiddleV,
  AlignRight,
  AlignTop,
  BoxSelect,
  Check,
  Copy,
  DistributeH,
  DistributeV,
  BarChart,
  Expand,
  ExternalLink,
  Frame,
  GridLayout,
  Layers,
  LayoutDashboard,
  Minus,
  Plus,
  TidyUp,
  Trash2,
  Unlink,
  type AppIcon
} from '@/components/icons'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Kbd } from '@/components/ui/kbd'
import { PALETTE } from '@/lib/colors'
import { cn } from '@/lib/utils'
import { bounds, type ArrangeMode } from './arrange'
import { BLOCK_DEFAULT_SIZE, HEADING_DEFAULT_SIZE, TEXT_SIZE_PRESETS, nearestPreset, type TextObjectKind, type TextSizePreset } from './textSize'
import type { ObjectNode } from './types'
import type { TextBlockStyle } from '@shared/types'

export interface SelectionActions {
  color: (c: string | null) => void
  arrange: (mode: ArrangeMode) => void
  group: () => void
  copy: () => void
  duplicate: () => void
  remove: () => void
  open: (node: ObjectNode) => void
  openInNewTab: (node: ObjectNode) => void
  blockStyle: (node: ObjectNode, style: TextBlockStyle) => void
  chartFromTable: (node: ObjectNode) => void
  unlinkChart: (node: ObjectNode) => void
  textSizePreset: (preset: TextSizePreset) => void
  stepTextSize: (dir: 1 | -1) => void
}

const textKindOf = (n: ObjectNode): TextObjectKind | null => (n.type === 'text' ? 'heading' : n.type === 'card' ? 'block' : null)

const TIDY: { mode: ArrangeMode; label: string; icon: AppIcon }[] = [
  { mode: 'left', label: 'Align left', icon: AlignLeft },
  { mode: 'center-h', label: 'Align centre', icon: AlignCenterH },
  { mode: 'right', label: 'Align right', icon: AlignRight },
  { mode: 'top', label: 'Align top', icon: AlignTop },
  { mode: 'middle', label: 'Align middle', icon: AlignMiddleV },
  { mode: 'bottom', label: 'Align bottom', icon: AlignBottom },
  { mode: 'distribute-h', label: 'Distribute horizontally', icon: DistributeH },
  { mode: 'distribute-v', label: 'Distribute vertically', icon: DistributeV },
  { mode: 'grid', label: 'Arrange as grid', icon: GridLayout }
]

const size = (n: ObjectNode, axis: 'width' | 'height'): number =>
  (axis === 'width' ? n.measured?.width ?? n.width : n.measured?.height ?? n.height) ?? (axis === 'width' ? 300 : 180)

/**
 * Floating toolbar shown right above the selection bounding box — no extra icon to click first.
 * Positioned in canvas (flow) space, translated into the wrapper via the current viewport.
 */
export function SelectionToolbar({ selected, actions }: { selected: ObjectNode[]; actions: SelectionActions }) {
  const { x: vx, y: vy, zoom } = useViewport()
  if (!selected.length || selected.some((n) => (n.data as { editing?: boolean }).editing)) return null
  const box = bounds(selected.map((n) => ({ id: n.id, x: n.position.x, y: n.position.y, width: size(n, 'width'), height: size(n, 'height') })))
  const left = (box.x + box.width / 2) * zoom + vx
  const top = box.y * zoom + vy - 12
  const single = selected.length === 1 ? selected[0] : null
  const many = selected.length > 1
  const block = single?.type === 'card' && single.data.card?.kind === 'block' ? single : null
  const framed = block?.data.object.data.style === 'framed'
  const linkedChart = single?.type === 'chart' && (single.data.object.data.source as { tableId?: string } | undefined)?.tableId ? single : null
  const textKinds = selected.map(textKindOf)
  const allText = textKinds.every((k): k is TextObjectKind => !!k)
  // shown preset: the nearest one to the (single) node's size, else 'M' as a neutral middle ground for a mixed selection
  const textPreset: TextSizePreset | null = allText
    ? (() => {
        if (!single) return 'M'
        const kind = textKinds[0]!
        const size = Number(single.data.object.data[kind === 'heading' ? 'size' : 'fontSize']) || (kind === 'heading' ? HEADING_DEFAULT_SIZE : BLOCK_DEFAULT_SIZE)
        return nearestPreset(kind, size)
      })()
    : null

  return (
    <div
      data-testid="selection-toolbar"
      className="pointer-events-none absolute top-0 left-0 z-10"
      style={{ transform: `translate(${left}px, ${top}px)` }}
    >
      <div className="pointer-events-auto flex -translate-x-1/2 -translate-y-full items-center gap-1 rounded-xl border bg-popover/95 p-1 shadow-[0_8px_30px_-6px_rgba(0,0,0,0.25)] backdrop-blur">
        <button
          aria-label="Default colour"
          title="Default colour"
          onClick={() => actions.color(null)}
          className="size-5 rounded-full border bg-card transition hover:scale-110"
        />
        {Object.keys(PALETTE)
          .filter((c) => c !== 'gray')
          .map((c) => (
            <button
              key={c}
              aria-label={c}
              title={c}
              onClick={() => actions.color(c)}
              className="size-5 rounded-full border border-transparent transition hover:scale-110"
              style={{ background: PALETTE[c].fg }}
            />
          ))}
        <Divider />
        {many && (
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger
                  aria-label="Tidy up"
                  className="grid size-7 place-items-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground"
                >
                  <TidyUp size={16} />
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>Tidy up</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="start" className="w-52" onCloseAutoFocus={(e) => e.preventDefault()}>
              {TIDY.map((t, i) => (
                <div key={t.mode}>
                  {(i === 6 || i === 8) && <DropdownMenuSeparator />}
                  <DropdownMenuItem onClick={() => actions.arrange(t.mode)}>
                    <t.icon /> {t.label}
                  </DropdownMenuItem>
                </div>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {many && <Action icon={BoxSelect} label="Create section" kbd="Mod+G" onClick={actions.group} />}
        {allText && textPreset && (
          <>
            <Action icon={Minus} label="Smaller text" kbd="Mod+Shift+," onClick={() => actions.stepTextSize(-1)} />
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger
                    aria-label="Text size"
                    className="grid h-7 min-w-7 place-items-center rounded-lg px-1.5 text-xs font-semibold text-muted-foreground transition hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground"
                  >
                    Aa
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>Text size ({textPreset})</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="center" className="w-28" onCloseAutoFocus={(e) => e.preventDefault()}>
                {TEXT_SIZE_PRESETS.map((p) => (
                  <DropdownMenuItem key={p} onClick={() => actions.textSizePreset(p)}>
                    <Check className={p === textPreset ? '' : 'opacity-0'} /> {p}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Action icon={Plus} label="Bigger text" kbd="Mod+Shift+." onClick={() => actions.stepTextSize(1)} />
          </>
        )}
        {block && (
          <Action
            icon={Frame}
            label={framed ? 'Plain text (no frame)' : 'Framed box'}
            active={framed}
            onClick={() => actions.blockStyle(block, framed ? 'plain' : 'framed')}
          />
        )}
        {single?.type === 'card' && <Action icon={Expand} label={block ? 'Open as card' : 'Open card'} onClick={() => actions.open(single)} />}
        {single?.type === 'table' && <Action icon={BarChart} label="Create chart from table" onClick={() => actions.chartFromTable(single)} />}
        {linkedChart && <Action icon={Unlink} label="Unlink from table" onClick={() => actions.unlinkChart(linkedChart)} />}
        {single?.type === 'whiteboard' && <Action icon={LayoutDashboard} label="Open whiteboard" onClick={() => actions.open(single)} />}
        {single?.type === 'whiteboard' && <Action icon={ExternalLink} label="Open in new tab" onClick={() => actions.openInNewTab(single)} />}
        <Divider />
        <Action icon={Copy} label="Copy" kbd="Mod+C" onClick={actions.copy} />
        <Action icon={Layers} label="Duplicate" kbd="Mod+D" onClick={actions.duplicate} />
        <Action icon={Trash2} label="Remove from whiteboard" onClick={actions.remove} destructive />
      </div>
    </div>
  )
}

const Divider = (): React.ReactElement => <div className="mx-0.5 h-5 w-px bg-border" />

function Action({
  icon: Icon,
  label,
  kbd,
  onClick,
  destructive,
  active
}: {
  icon: AppIcon
  label: string
  kbd?: string
  onClick: () => void
  destructive?: boolean
  active?: boolean
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label={label}
          onClick={onClick}
          className={cn(
            'grid size-7 place-items-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground',
            destructive && 'hover:bg-destructive/10 hover:text-destructive',
            active && 'bg-accent text-foreground'
          )}
        >
          <Icon size={16} />
        </button>
      </TooltipTrigger>
      <TooltipContent className="flex items-center gap-2">
        {label} {kbd && <Kbd>{kbd.replace('Mod', '⌘')}</Kbd>}
      </TooltipContent>
    </Tooltip>
  )
}

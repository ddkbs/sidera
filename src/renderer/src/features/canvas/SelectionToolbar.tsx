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
import { colorName, PALETTE } from '@/lib/colors'
import { t, type MessageKey } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { bounds, type ArrangeMode } from './arrange'
import { BLOCK_DEFAULT_SIZE, TEXT_SIZE_PRESETS, nearestPreset, type TextSizePreset } from './textSize'
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

const TIDY: { mode: ArrangeMode; label: MessageKey; icon: AppIcon }[] = [
  { mode: 'left', label: 'tidy.left', icon: AlignLeft },
  { mode: 'center-h', label: 'tidy.centerH', icon: AlignCenterH },
  { mode: 'right', label: 'tidy.right', icon: AlignRight },
  { mode: 'top', label: 'tidy.top', icon: AlignTop },
  { mode: 'middle', label: 'tidy.middle', icon: AlignMiddleV },
  { mode: 'bottom', label: 'tidy.bottom', icon: AlignBottom },
  { mode: 'distribute-h', label: 'tidy.distributeH', icon: DistributeH },
  { mode: 'distribute-v', label: 'tidy.distributeV', icon: DistributeV },
  { mode: 'grid', label: 'tidy.grid', icon: GridLayout }
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
  const allText = selected.every((n) => n.type === 'card')
  // shown preset: the nearest one to the (single) node's size, else 'M' as a neutral middle ground for a mixed selection
  const textPreset: TextSizePreset | null = allText ? (single ? nearestPreset(Number(single.data.object.data.fontSize) || BLOCK_DEFAULT_SIZE) : 'M') : null

  return (
    <div
      data-testid="selection-toolbar"
      className="pointer-events-none absolute top-0 left-0 z-10"
      style={{ transform: `translate(${left}px, ${top}px)` }}
    >
      <div className="pointer-events-auto flex -translate-x-1/2 -translate-y-full items-center gap-1 rounded-xl border bg-popover/95 p-1 shadow-[0_8px_30px_-6px_rgba(0,0,0,0.25)] backdrop-blur">
        <button
          aria-label={t('format.defaultColor')}
          title={t('format.defaultColor')}
          onClick={() => actions.color(null)}
          className="size-5 rounded-full border bg-card transition hover:scale-110"
        />
        {Object.keys(PALETTE)
          .filter((c) => c !== 'gray')
          .map((c) => (
            <button
              key={c}
              aria-label={colorName(c)}
              title={colorName(c)}
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
                  aria-label={t('tidy.title')}
                  className="grid size-7 place-items-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground"
                >
                  <TidyUp size={16} />
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>{t('tidy.title')}</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="start" className="w-52" onCloseAutoFocus={(e) => e.preventDefault()}>
              {TIDY.map((item, i) => (
                <div key={item.mode}>
                  {(i === 6 || i === 8) && <DropdownMenuSeparator />}
                  <DropdownMenuItem onClick={() => actions.arrange(item.mode)}>
                    <item.icon /> {t(item.label)}
                  </DropdownMenuItem>
                </div>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {many && <Action icon={BoxSelect} label={t('sel.createSection')} kbd="Mod+G" onClick={actions.group} />}
        {allText && textPreset && (
          <>
            <Action icon={Minus} label={t('cmd.canvas.textSmaller')} kbd="Mod+Shift+," onClick={() => actions.stepTextSize(-1)} />
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger
                    aria-label={t('settings.appearance.textSize')}
                    className="grid h-7 min-w-7 place-items-center rounded-lg px-1.5 text-xs font-semibold text-muted-foreground transition hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground"
                  >
                    Aa
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>{t('sel.textSize', { size: textPreset })}</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="center" className="w-28" onCloseAutoFocus={(e) => e.preventDefault()}>
                {TEXT_SIZE_PRESETS.map((p) => (
                  <DropdownMenuItem key={p} onClick={() => actions.textSizePreset(p)}>
                    <Check className={p === textPreset ? '' : 'opacity-0'} /> {p}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Action icon={Plus} label={t('cmd.canvas.textBigger')} kbd="Mod+Shift+." onClick={() => actions.stepTextSize(1)} />
          </>
        )}
        {block && (
          <Action
            icon={Frame}
            label={framed ? t('undo.removeFrame') : t('undo.addFrame')}
            active={framed}
            onClick={() => actions.blockStyle(block, framed ? 'plain' : 'framed')}
          />
        )}
        {single?.type === 'card' && <Action icon={Expand} label={block ? t('sel.openAsCard') : t('task.openCard')} onClick={() => actions.open(single)} />}
        {single?.type === 'table' && <Action icon={BarChart} label={t('sel.chartFromTable')} onClick={() => actions.chartFromTable(single)} />}
        {linkedChart && <Action icon={Unlink} label={t('sel.unlinkTable')} onClick={() => actions.unlinkChart(linkedChart)} />}
        {single?.type === 'whiteboard' && <Action icon={LayoutDashboard} label={t('sel.openBoard')} onClick={() => actions.open(single)} />}
        {single?.type === 'whiteboard' && <Action icon={ExternalLink} label={t('help.fixed.cmdClick')} onClick={() => actions.openInNewTab(single)} />}
        <Divider />
        <Action icon={Copy} label={t('common.copy')} kbd="Mod+C" onClick={actions.copy} />
        <Action icon={Layers} label={t('common.duplicate')} kbd="Mod+D" onClick={actions.duplicate} />
        <Action icon={Trash2} label={t('help.fixed.remove')} onClick={actions.remove} destructive />
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

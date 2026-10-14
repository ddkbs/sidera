import { useReactFlow } from '@xyflow/react'
import { BoxSelect, FileText, Globe, TrendingUp, LayoutDashboard, Network, PenTool, BarChart, Table2, Type, Workflow, File } from '@/components/icons'
import { useState } from 'react'
import { t } from '@/lib/i18n'
import { useCommands } from '@/lib/shortcuts'
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import type { ObjectNode } from './types'

const ICONS = { card: FileText, section: BoxSelect, whiteboard: LayoutDashboard, file: File, mindmap: Network, mermaid: Workflow, sketch: PenTool, chart: BarChart, link: Globe, table: Table2, stock: TrendingUp }

const label = (n: ObjectNode): string => {
  const o = n.data.object
  switch (o.kind) {
    case 'card':
      if (n.data.card?.kind === 'block') return n.data.card.excerpt.replace(/\s+/g, ' ') || t('find.emptyTextBox')
      return [n.data.card?.title, n.data.card?.excerpt].filter(Boolean).join(' — ') || t('find.untitledCard')
    case 'section':
      return String(o.data.title ?? t('canvas.section'))
    case 'whiteboard':
      return n.data.childName ?? t('board.whiteboard')
    case 'chart':
      return String(o.data.title ?? t('insert.chart'))
    case 'table':
      return String(o.data.title || t('library.table'))
    case 'file':
      return String(o.data.name ?? t('canvas.file'))
    case 'stock':
      return String(o.data.symbol ?? t('insert.stock'))
    case 'link':
      return String(o.data.title ?? o.data.url ?? t('format.link'))
    default:
      return String(o.data.source ?? o.kind).split('\n')[0]
  }
}

/** ⌘F — find an object on the current whiteboard and fly to it. */
export function FindOnBoard() {
  const rf = useReactFlow<ObjectNode>()
  const [open, setOpen] = useState(false)
  useCommands({ 'canvas.find': () => setOpen(true) })

  const nodes = open ? rf.getNodes() : []
  return (
    <CommandDialog open={open} onOpenChange={setOpen} title={t('cmd.canvas.find')}>
      <CommandInput placeholder={t('find.placeholder')} />
      <CommandList>
        <CommandEmpty>{t('find.nothing')}</CommandEmpty>
        <CommandGroup heading={t('find.onBoard')}>
          {nodes.map((n) => {
            const Icon = n.data.card?.kind === 'block' ? Type : ICONS[n.data.object.kind]
            const text = label(n)
            return (
              <CommandItem
                key={n.id}
                value={`${text} ${n.id}`}
                onSelect={() => {
                  setOpen(false)
                  rf.setNodes((ns) => ns.map((x) => ({ ...x, selected: x.id === n.id })))
                  void rf.fitView({ nodes: [{ id: n.id }], duration: 500, padding: 0.6, maxZoom: 1.2 })
                }}
              >
                <Icon className="text-muted-foreground" />
                <span className="truncate">{text}</span>
              </CommandItem>
            )
          })}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}

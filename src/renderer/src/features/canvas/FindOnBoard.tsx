import { useReactFlow } from '@xyflow/react'
import { BoxSelect, FileText, LayoutDashboard, Network, PenTool, Type, Workflow, File } from '@/components/icons'
import { useState } from 'react'
import { useCommands } from '@/lib/shortcuts'
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import type { ObjectNode } from './types'

const ICONS = { card: FileText, text: Type, section: BoxSelect, whiteboard: LayoutDashboard, file: File, mindmap: Network, mermaid: Workflow, sketch: PenTool }

const label = (n: ObjectNode): string => {
  const o = n.data.object
  switch (o.kind) {
    case 'card':
      return [n.data.card?.title, n.data.card?.excerpt].filter(Boolean).join(' — ') || 'Untitled card'
    case 'text':
      return String(o.data.text ?? '')
    case 'section':
      return String(o.data.title ?? 'Section')
    case 'whiteboard':
      return n.data.childName ?? 'Whiteboard'
    case 'file':
      return String(o.data.name ?? 'File')
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
    <CommandDialog open={open} onOpenChange={setOpen} title="Find on whiteboard">
      <CommandInput placeholder="Find on this whiteboard…" />
      <CommandList>
        <CommandEmpty>Nothing found</CommandEmpty>
        <CommandGroup heading="On this whiteboard">
          {nodes.map((n) => {
            const Icon = ICONS[n.data.object.kind]
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

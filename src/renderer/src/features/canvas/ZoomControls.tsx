import { MiniMap, useReactFlow, useViewport } from '@xyflow/react'
import { Map as MapIcon, Maximize, Minus, Plus } from '@/components/icons'
import { useState } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export function ZoomControls() {
  const rf = useReactFlow()
  const { zoom } = useViewport()
  const [showMap, setShowMap] = useState(true)
  const btn = 'grid size-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground'
  return (
    <div className="absolute right-3 bottom-3 z-10 flex flex-col items-end gap-2">
      {showMap && (
        <MiniMap
          pannable
          zoomable
          position="bottom-right"
          style={{ position: 'relative', margin: 0, width: 200, height: 130 }}
          className="overflow-hidden rounded-xl! border bg-popover! shadow-lg"
          maskColor="color-mix(in oklch, var(--foreground) 6%, transparent)"
          nodeBorderRadius={6}
          nodeColor={(n) => (n.type === 'section' ? 'color-mix(in oklch, var(--brand) 18%, transparent)' : 'var(--muted-foreground)')}
        />
      )}
      <div className="flex items-center gap-0.5 rounded-xl border bg-popover/95 p-1 shadow-lg backdrop-blur">
        <Tooltip>
          <TooltipTrigger asChild>
            <button className={cn(btn, showMap && 'text-foreground')} onClick={() => setShowMap((s) => !s)} aria-label="Toggle minimap">
              <MapIcon className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Minimap</TooltipContent>
        </Tooltip>
        <div className="mx-0.5 h-4 w-px bg-border" />
        <button className={btn} onClick={() => rf.zoomOut({ duration: 150 })} aria-label="Zoom out">
          <Minus className="size-4" />
        </button>
        <button
          className="h-8 w-12 rounded-lg text-xs font-medium tabular-nums transition hover:bg-accent"
          onClick={() => rf.zoomTo(1, { duration: 200 })}
          title="Reset to 100%"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button className={btn} onClick={() => rf.zoomIn({ duration: 150 })} aria-label="Zoom in">
          <Plus className="size-4" />
        </button>
        <button className={btn} onClick={() => rf.fitView({ duration: 300, padding: 0.15 })} aria-label="Fit view">
          <Maximize className="size-4" />
        </button>
      </div>
    </div>
  )
}

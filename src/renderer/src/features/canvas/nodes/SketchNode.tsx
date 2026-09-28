import type { NodeProps } from '@xyflow/react'
import { PenTool } from '@/components/icons'
import { memo } from 'react'
import { cn } from '@/lib/utils'
import { useAppSelector } from '@/store'
import type { ObjectNode } from '../types'
import { Handles, Resizer } from './NodeChrome'

export const EDIT_SKETCH_EVENT = 'sidera:edit-sketch'

/**
 * Freehand sketch (Excalidraw). Preview is a static SVG rendered as <img> so it can't run scripts.
 * Dark mode: sketches with images carry a pre-rendered `svgDark` (Excalidraw's dark export: ink inverted, photos
 * re-inverted so they keep their colours), shown without a filter; ink-only sketches are inverted with CSS as before.
 */
export const SketchNode = memo(function SketchNode({ id, data, selected }: NodeProps<ObjectNode>) {
  const dark = useAppSelector((s) => s.ui.theme) === 'dark'
  const darkSvg = typeof data.object.data.svgDark === 'string' ? data.object.data.svgDark : ''
  const svg = dark && darkSvg ? darkSvg : typeof data.object.data.svg === 'string' ? data.object.data.svg : ''
  return (
    <>
      <Resizer selected={selected} minWidth={160} minHeight={120} />
      <div
        onDoubleClick={() => window.dispatchEvent(new CustomEvent(EDIT_SKETCH_EVENT, { detail: id }))}
        className={cn('flex h-full w-full items-center justify-center overflow-hidden rounded-xl border bg-card p-2 shadow-sm', selected && 'ring-2 ring-brand/70')}
      >
        {svg ? (
          <img
            alt="Sketch"
            draggable={false}
            className={cn('h-full w-full object-contain', !darkSvg && 'dark:invert dark:hue-rotate-180')}
            src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}
          />
        ) : (
          <div className="flex flex-col items-center gap-1.5 text-sm text-muted-foreground">
            <PenTool className="size-5" />
            Double-click to draw
          </div>
        )}
      </div>
      <Handles />
    </>
  )
})

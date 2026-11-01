import type { NodeProps } from '@xyflow/react'
import { PenTool } from '@/components/icons'
import { memo, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { useAppSelector } from '@/store'
import { InkSvg } from '@/features/ink/InkSvg'
import { isFrameless } from '@/features/ink/frame'
import { inkBounds } from '@/features/ink/geometry'
import type { ObjectNode } from '../types'
import { Handles, Resizer } from './NodeChrome'
import { Rotatable } from './Rotatable'
import { PointHandles } from '@/features/ink/PointHandles'
import { t, useLang } from '@/lib/i18n'
import { IS_IPAD } from '@/lib/platform'

export const EDIT_SKETCH_EVENT = 'sidera:edit-sketch'

/**
 * Freehand sketch (Excalidraw), framed or frameless ("ink").
 *
 * Framed: a card whose preview is the stored static SVG shown as <img> (can't run scripts). Dark mode: sketches with
 * images carry a pre-rendered `svgDark` (Excalidraw's dark export, photos keep their colours), shown without a
 * filter; ink-only sketches are inverted with CSS.
 *
 * Frameless (`data.frameless`): no border/background/padding — the strokes are drawn straight onto the board as
 * inline SVG built from the elements (`InkSvg`). The node itself ignores the pointer (CSS in canvas.css); only the
 * painted ink and photos are hit, so empty space inside the bounding box still reaches whatever lies below.
 */
export const SketchNode = memo(function SketchNode({ id, data, selected, width, height }: NodeProps<ObjectNode>) {
  useLang()
  const dark = useAppSelector((s) => s.ui.theme) === 'dark'
  const d = data.object.data
  const [preview, setPreview] = useState<unknown[] | null>(null)
  const stored = Array.isArray(d.elements) ? (d.elements as unknown[]) : undefined
  const elements = preview ?? stored
  const files = d.files && typeof d.files === 'object' ? (d.files as Record<string, unknown>) : undefined
  const bounds = useMemo(() => inkBounds(stored), [stored])
  const rotation = Number(d.rotation) || 0
  const edit = () => window.dispatchEvent(new CustomEvent(EDIT_SKETCH_EVENT, { detail: id }))

  if (isFrameless(d) && bounds) {
    const w = width ?? data.object.width
    return (
      <>
        {!IS_IPAD && <Resizer selected={selected} minWidth={16} minHeight={16} keepAspectRatio />}
        <div className="sketch-frameless relative h-full w-full" onDoubleClick={edit}>
          <Rotatable id={id} rotation={rotation} selected={!!selected}>
            <InkSvg
              elements={elements}
              files={files}
              dark={dark}
              scale={w / bounds.width}
              interactive
              viewBounds={preview ? bounds : null}
              className="absolute inset-0"
            />
            {selected && stored && (
              <PointHandles id={id} elements={stored} width={w} height={height ?? data.object.height} rotation={rotation} onPreview={setPreview} />
            )}
            {!IS_IPAD && (
              <div
                className={cn(
                  'ink-outline pointer-events-none absolute -inset-1.5 rounded-md border border-dashed border-brand/50 opacity-0 transition-opacity',
                  selected && 'border-solid border-brand/70 opacity-100'
                )}
              />
            )}
          </Rotatable>
        </div>
        {/* iPad: handwriting has no connection points (they popped up under the hovering Pencil) */}
        {!IS_IPAD && <Handles />}
      </>
    )
  }

  const darkSvg = typeof d.svgDark === 'string' ? d.svgDark : ''
  const svg = dark && darkSvg ? darkSvg : typeof d.svg === 'string' ? d.svg : ''
  return (
    <>
      <Resizer selected={selected} minWidth={160} minHeight={120} />
      <Rotatable id={id} rotation={rotation} selected={!!selected}>
        <div
          onDoubleClick={edit}
          className={cn(
            'flex h-full w-full items-center justify-center overflow-hidden rounded-xl border bg-card p-2 shadow-sm',
            selected && 'ring-2 ring-brand/70'
          )}
        >
          {svg ? (
            <img
              alt={t('ink.sketch')}
              draggable={false}
              className={cn('h-full w-full object-contain', !darkSvg && 'dark:invert dark:hue-rotate-180')}
              src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}
            />
          ) : bounds ? (
            // ink drawn in pen mode has no stored preview: render it from the elements
            <div className="h-full w-full p-4">
              <InkSvg elements={elements} files={files} dark={dark} scale={1} />
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5 text-sm text-muted-foreground">
              <PenTool className="size-5" />
              {t('sketch.doubleClick')}
            </div>
          )}
        </div>
      </Rotatable>
      <Handles />
    </>
  )
})

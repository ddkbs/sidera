import { memo, useMemo, type CSSProperties, type ReactNode } from 'react'
import { absPoints, smoothPath, darkInk, freedrawOutline, inkBounds, liveElements, outlinePath, type InkElement } from './geometry'

/** Only raster data URLs may be shown from stored sketch files. */
const SAFE_IMAGE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/

interface Props {
  elements: readonly unknown[] | undefined
  files?: Record<string, unknown>
  dark: boolean
  /** board px per scene unit (object width / ink bounds width): sizes the invisible hit strokes */
  scale: number
  /** true = only the ink takes pointer events (frameless sketches) */
  interactive?: boolean
  className?: string
  /** fixed viewBox (e.g. while dragging a point, so the rest of the ink doesn't re-fit) */
  viewBounds?: { x: number; y: number; width: number; height: number } | null
}

/** Invisible hit area around thin ink, in screen-ish px at zoom 1. */
const HIT_PX = 8

/**
 * The sketch scene as inline SVG built from its elements (never from stored markup). viewBox = ink bounds, so the
 * box shows the ink uniformly scaled and centred — the same mapping as `fitTransform`. Freedraw strokes use
 * Excalidraw's own outline, so ink looks the same here, in the pen overlay and in the editor.
 */
export const InkSvg = memo(function InkSvg({ elements, files, dark, scale, interactive, className, viewBounds }: Props) {
  const fitted = useMemo(() => inkBounds(elements), [elements])
  const bounds = viewBounds ?? fitted
  const live = useMemo(() => liveElements<InkElement>(elements), [elements])
  if (!bounds) return null
  const hitW = HIT_PX / (scale || 1)
  const ink = (c: string | undefined): string | undefined => (dark ? darkInk(c) : c)
  const pe = (v: CSSProperties['pointerEvents']): CSSProperties | undefined => (interactive ? { pointerEvents: v } : undefined)

  const render = (el: InkElement, i: number): ReactNode => {
    const key = el.id ?? i
    const opacity = (el.opacity ?? 100) / 100
    const w = el.width ?? 0
    const h = el.height ?? 0
    const transform = el.angle ? `rotate(${(el.angle * 180) / Math.PI} ${el.x + w / 2} ${el.y + h / 2})` : undefined
    const stroke = ink(el.strokeColor) ?? 'currentColor'
    const fill = el.backgroundColor && el.backgroundColor !== 'transparent' ? ink(el.backgroundColor) : 'none'
    const sw = el.strokeWidth ?? 1
    switch (el.type) {
      case 'freedraw': {
        const d = outlinePath(freedrawOutline(el))
        return (
          <g key={key} data-ink={el.id} transform={transform}>
            <path d={d} fill={stroke} opacity={opacity} style={pe('visiblePainted')} />
            {interactive && <path d={d} fill="none" stroke="transparent" strokeWidth={hitW} strokeLinejoin="round" style={pe('stroke')} />}
          </g>
        )
      }
      case 'line':
      case 'arrow': {
        const pts = absPoints(el)
        if (!pts.length) return null
        const d = (el as { roundness?: unknown }).roundness ? smoothPath(pts) : pts.map((p, j) => `${j ? 'L' : 'M'}${p.x},${p.y}`).join(' ')
        const heads: string[] = []
        const head = (tip: { x: number; y: number }, from: { x: number; y: number }): void => {
          const a = Math.atan2(tip.y - from.y, tip.x - from.x)
          const len = Math.min(20, 6 + sw * 4)
          for (const s of [-1, 1]) heads.push(`M${tip.x},${tip.y} L${tip.x - len * Math.cos(a + s * 0.45)},${tip.y - len * Math.sin(a + s * 0.45)}`)
        }
        if (el.type === 'arrow' && pts.length > 1) {
          if (el.endArrowhead !== null) head(pts[pts.length - 1], pts[pts.length - 2])
          if (el.startArrowhead) head(pts[0], pts[1])
        }
        const full = [d, ...heads].join(' ')
        return (
          <g key={key} data-ink={el.id} transform={transform} opacity={opacity}>
            <path d={full} fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={pe('visibleStroke')} />
            {interactive && <path d={full} fill="none" stroke="transparent" strokeWidth={sw + hitW} strokeLinecap="round" style={pe('stroke')} />}
          </g>
        )
      }
      case 'rectangle':
      case 'diamond':
      case 'ellipse': {
        const shape =
          el.type === 'rectangle' ? (
            <rect x={el.x} y={el.y} width={w} height={h} rx={Math.min(w, h) * 0.08} />
          ) : el.type === 'ellipse' ? (
            <ellipse cx={el.x + w / 2} cy={el.y + h / 2} rx={w / 2} ry={h / 2} />
          ) : (
            <polygon points={`${el.x + w / 2},${el.y} ${el.x + w},${el.y + h / 2} ${el.x + w / 2},${el.y + h} ${el.x},${el.y + h / 2}`} />
          )
        return (
          <g
            key={key}
            data-ink={el.id}
            transform={transform}
            opacity={opacity}
            fill={fill}
            stroke={stroke}
            strokeWidth={sw}
            style={pe(fill === 'none' ? 'visibleStroke' : 'visiblePainted')}
          >
            {shape}
          </g>
        )
      }
      case 'text': {
        const size = el.fontSize ?? 20
        const lines = String(el.text ?? '').split('\n')
        return (
          <g key={key} data-ink={el.id} transform={transform} opacity={opacity}>
            {interactive && <rect x={el.x} y={el.y} width={w} height={h} fill="transparent" style={pe('visiblePainted')} />}
            <text x={el.x} y={el.y} fontSize={size} fill={stroke} fontFamily="var(--font-sans)" dominantBaseline="text-before-edge" style={pe('none')}>
              {lines.map((line, j) => (
                <tspan key={j} x={el.x} dy={j ? size * 1.25 : 0}>
                  {line}
                </tspan>
              ))}
            </text>
          </g>
        )
      }
      case 'image': {
        const file = el.fileId ? (files?.[el.fileId] as { dataURL?: unknown } | undefined) : undefined
        const href = typeof file?.dataURL === 'string' && SAFE_IMAGE.test(file.dataURL) ? file.dataURL : null
        if (!href) return null
        return (
          <image
            key={key}
            data-ink={el.id}
            href={href}
            x={el.x}
            y={el.y}
            width={w}
            height={h}
            preserveAspectRatio="none"
            transform={transform}
            opacity={opacity}
            style={pe('visiblePainted')}
          />
        )
      }
      default:
        return null
    }
  }

  return (
    <svg
      className={className}
      viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`}
      preserveAspectRatio="xMidYMid meet"
      width="100%"
      height="100%"
      overflow="visible"
      style={interactive ? { pointerEvents: 'none', overflow: 'visible' } : { overflow: 'visible' }}
      aria-label="Sketch"
      role="img"
    >
      {live.map(render)}
    </svg>
  )
})

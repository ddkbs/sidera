import { memo, type ReactNode } from 'react'
import type { BoardPreview as Preview, BoardPreviewItem } from '@shared/types'
import { color as paletteColor } from '@/lib/colors'
import { colorAt } from '../charts/palette'
import { darkInk } from '../ink/geometry'
import { t, useLang } from '@/lib/i18n'

/** Smallest area (board units) a preview shows, so a board with one small block doesn't render it huge. */
const MIN_VIEW = { width: 720, height: 300 }

/**
 * A board's mini-map for Home tiles: simplified shapes built from object geometry (no React Flow, no content).
 * Blocks and cards show a few text lines, tables rows, charts a hint of their type, ink its simplified strokes.
 */
export const BoardPreview = memo(function BoardPreview({ preview, dark }: { preview: Preview | undefined; dark: boolean }) {
  useLang()
  if (!preview) return null
  if (!preview.bounds) return <div className="grid size-full place-items-center text-xs text-muted-foreground/70">{t('home.emptyBoard')}</div>
  const b = preview.bounds
  const pad = Math.max(b.width, b.height) * 0.06 + 16
  const w = Math.max(MIN_VIEW.width, b.width + pad * 2)
  const h = Math.max(MIN_VIEW.height, b.height + pad * 2)
  const viewBox = `${b.x + b.width / 2 - w / 2} ${b.y + b.height / 2 - h / 2} ${w} ${h}`
  // board units per rendered pixel is roughly w / 300: keep hairlines and text lines legible at any zoom
  const unit = w / 300
  return (
    <svg viewBox={viewBox} preserveAspectRatio="xMidYMid meet" className="size-full" aria-hidden>
      {preview.items.map((it, i) => (
        <Item key={i} it={it} unit={unit} dark={dark} />
      ))}
    </svg>
  )
})

function lines(x: number, y: number, w: number, h: number, unit: number, opts: { first?: number; gap?: number; bold?: boolean } = {}): ReactNode[] {
  const lh = Math.max(unit * 2, Math.min(14, h / 4))
  const gap = opts.gap ?? lh * 1.9
  const n = Math.max(1, Math.min(6, Math.floor((h + gap - lh) / gap)))
  return Array.from({ length: n }, (_, i) => {
    const len = i === 0 ? (opts.first ?? 0.75) : i === n - 1 && n > 1 ? 0.55 : 0.92 - (i % 3) * 0.08
    return (
      <rect
        key={i}
        x={x}
        y={y + i * gap}
        width={Math.max(unit, w * len)}
        height={lh}
        rx={lh / 2}
        className={i === 0 && opts.bold ? 'fill-foreground/55' : 'fill-muted-foreground/35'}
      />
    )
  })
}

function Item({ it, unit, dark }: { it: BoardPreviewItem; unit: number; dark: boolean }) {
  const { x, y, w, h } = it
  const r = Math.min(12, w / 8, h / 8)
  const stroke = { vectorEffect: 'non-scaling-stroke' as const, strokeWidth: 1 }
  const inner = Math.min(18, w * 0.08, h * 0.12)
  switch (it.kind) {
    case 'section': {
      const c = paletteColor(it.color)
      return (
        <g>
          <rect x={x} y={y} width={w} height={h} rx={Math.min(20, r * 2)} style={{ fill: c.bg, stroke: c.border }} {...stroke} strokeDasharray="4 3" />
          <rect x={x + inner} y={y + inner} width={Math.min(w * 0.3, 160)} height={Math.max(unit * 2.4, 16)} rx={8} style={{ fill: c.fg }} opacity={0.55} />
        </g>
      )
    }
    case 'block': {
      const tint = it.color ? paletteColor(it.color) : null
      return (
        <g>
          {it.framed && <rect x={x} y={y} width={w} height={h} rx={r} className="fill-card stroke-border" style={tint ? { fill: tint.bg } : undefined} {...stroke} />}
          {lines(x + (it.framed ? inner : 4), y + (it.framed ? inner : 6), w - (it.framed ? inner * 2 : 8), h - (it.framed ? inner * 2 : 12), unit, { bold: true, first: 0.6 })}
        </g>
      )
    }
    case 'card': {
      const tint = it.color ? paletteColor(it.color) : null
      return (
        <g>
          <rect x={x} y={y} width={w} height={h} rx={r} className="fill-card stroke-border" {...stroke} />
          {tint && <rect x={x} y={y} width={w} height={Math.min(10, h / 10)} rx={2} style={{ fill: tint.fg }} opacity={0.7} />}
          {lines(x + inner, y + inner, w - inner * 2, h - inner * 2, unit, { bold: true, first: 0.55 })}
        </g>
      )
    }
    case 'table': {
      const rows = Math.max(2, Math.min(8, it.rows ?? 4))
      const top = y + inner * 1.8
      const rh = (h - (top - y) - inner / 2) / (rows + 1)
      return (
        <g>
          <rect x={x} y={y} width={w} height={h} rx={r} className="fill-card stroke-border" {...stroke} />
          <rect x={x + inner} y={y + inner * 0.6} width={w * 0.45} height={Math.max(unit * 2, 12)} rx={6} className="fill-foreground/55" />
          {Array.from({ length: rows + 1 }, (_, i) => (
            <line key={i} x1={x + inner / 2} x2={x + w - inner / 2} y1={top + rh * (i + 1)} y2={top + rh * (i + 1)} className="stroke-border" {...stroke} />
          ))}
          <line x1={x + w * 0.55} x2={x + w * 0.55} y1={top} y2={y + h - inner / 2} className="stroke-border" {...stroke} />
        </g>
      )
    }
    case 'chart':
      return (
        <g>
          <rect x={x} y={y} width={w} height={h} rx={r} className="fill-card stroke-border" {...stroke} />
          <ChartGlyph it={it} inner={inner} />
        </g>
      )
    case 'ink':
      return (
        <g fill="none" strokeLinecap="round" strokeLinejoin="round">
          {it.strokes?.map((s, i) => (
            <polyline
              key={i}
              points={s.points.map((p) => p.join(',')).join(' ')}
              stroke={dark ? darkInk(s.color) : s.color}
              strokeOpacity={s.opacity ?? 1}
              vectorEffect="non-scaling-stroke"
              strokeWidth={s.opacity !== undefined && s.opacity < 0.6 ? 5 : 1.6}
            />
          ))}
        </g>
      )
    default:
      return <rect x={x} y={y} width={w} height={h} rx={r} className="fill-muted stroke-border" {...stroke} />
  }
}

/** A hint of the chart's type: bars, a line, a ring or a timeline — fixed shapes, not the data. */
function ChartGlyph({ it, inner }: { it: BoardPreviewItem; inner: number }) {
  const x0 = it.x + inner
  const y0 = it.y + inner * 1.8
  const w = it.w - inner * 2
  const h = it.h - inner * 2.8
  const t = it.chartType ?? 'column'
  if (t === 'pie' || t === 'donut') {
    const rr = (Math.min(w, h) / 2) * 0.75
    const c = 2 * Math.PI * rr
    const ring = { cx: x0 + w / 2, cy: y0 + h / 2, r: rr, fill: 'none', strokeWidth: rr * 0.5 }
    return (
      <g transform={`rotate(-90 ${ring.cx} ${ring.cy})`}>
        <circle {...ring} stroke={colorAt(1)} />
        <circle {...ring} stroke={colorAt(0)} strokeDasharray={`${c * 0.62} ${c}`} />
      </g>
    )
  }
  if (t === 'timeline') {
    const cy = y0 + h / 2
    const n = 5
    return (
      <g>
        <line x1={x0} x2={x0 + w} y1={cy} y2={cy} className="stroke-border" strokeWidth={Math.max(2, h * 0.03)} />
        {Array.from({ length: n }, (_, i) => {
          const cx = x0 + (w * (i + 0.5)) / n
          const up = i % 2 === 0
          return (
            <g key={i}>
              <rect x={cx - w / n / 3} y={up ? cy - h * 0.34 : cy + h * 0.18} width={(w / n) * 0.66} height={Math.max(4, h * 0.1)} rx={3} className="fill-muted-foreground/35" />
              <circle cx={cx} cy={cy} r={Math.max(4, Math.min(w, h) * 0.045)} fill={colorAt(i)} />
            </g>
          )
        })}
      </g>
    )
  }
  const heights = [0.35, 0.55, 0.45, 0.7, 0.8, 1]
  if (t === 'line' || t === 'area' || t === 'scatter' || t === 'bubble' || t === 'radar') {
    const pts = heights.map((v, i) => [x0 + (w * i) / (heights.length - 1), y0 + h - v * h * 0.9] as const)
    return <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={colorAt(0)} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
  }
  const bw = w / heights.length
  const horizontal = t === 'bar'
  return (
    <g>
      {heights.map((v, i) =>
        horizontal ? (
          <rect key={i} x={x0} y={y0 + (h / heights.length) * i + 2} width={w * v} height={h / heights.length - 4} rx={2} fill={colorAt(0)} opacity={0.85} />
        ) : (
          <rect key={i} x={x0 + bw * i + bw * 0.18} y={y0 + h - v * h} width={bw * 0.64} height={v * h} rx={2} fill={colorAt(0)} opacity={0.85} />
        )
      )}
    </g>
  )
}

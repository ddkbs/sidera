import { useEffect, useRef } from 'react'

type Props = {
  /** Cell size in CSS px. */
  cell?: number
  /** Pointer radius in cells. */
  radius?: number
  /** Per-frame energy kept (0..1); lower lets go faster. */
  decay?: number
  /** Random ambient pulses per second, so the grid breathes without a pointer. */
  ambient?: number
  className?: string
}

/**
 * A fine grid that lights up where the pointer passes and lets go a moment later. Cells under any
 * `[data-grid-avoid]` element inside the same parent stay dark, so copy never sits on lit cells.
 */
export function GridPulse({ cell = 28, radius = 2.6, decay = 0.935, ambient = 5, className = '' }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current!
    const host = canvas.parentElement!
    const ctx = canvas.getContext('2d')!
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    let w = 0
    let h = 0
    let cols = 0
    let rows = 0
    let energy = new Float32Array(0)
    let hue = new Float32Array(0)
    let blocked = new Uint8Array(0)
    let last: { x: number; y: number } | null = null
    let raf = 0
    let visible = true
    let prev = performance.now()

    const measure = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const r = host.getBoundingClientRect()
      w = r.width
      h = r.height
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      cols = Math.ceil(w / cell) + 1
      rows = Math.ceil(h / cell) + 1
      energy = new Float32Array(cols * rows)
      hue = new Float32Array(cols * rows)
      blocked = new Uint8Array(cols * rows)
      for (const el of host.querySelectorAll<HTMLElement>('[data-grid-avoid]')) {
        const b = el.getBoundingClientRect()
        const x0 = Math.floor((b.left - r.left) / cell)
        const x1 = Math.floor((b.right - r.left) / cell)
        const y0 = Math.floor((b.top - r.top) / cell)
        const y1 = Math.floor((b.bottom - r.top) / cell)
        for (let y = Math.max(0, y0); y <= Math.min(rows - 1, y1); y++)
          for (let x = Math.max(0, x0); x <= Math.min(cols - 1, x1); x++) blocked[y * cols + x] = 1
      }
    }

    const light = (px: number, py: number, strength = 1, tint = 0) => {
      const cx = px / cell
      const cy = py / cell
      const r = Math.ceil(radius)
      for (let y = Math.floor(cy) - r; y <= Math.floor(cy) + r; y++) {
        if (y < 0 || y >= rows) continue
        for (let x = Math.floor(cx) - r; x <= Math.floor(cx) + r; x++) {
          if (x < 0 || x >= cols) continue
          const i = y * cols + x
          if (blocked[i]) continue
          const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / radius
          if (d > 1) continue
          const e = (1 - d) ** 1.6 * strength
          if (e > energy[i]) {
            energy[i] = e
            hue[i] = tint
          }
        }
      }
    }

    const onMove = (ev: PointerEvent) => {
      const r = host.getBoundingClientRect()
      const x = ev.clientX - r.left
      const y = ev.clientY - r.top
      if (x < -cell || y < -cell || x > w + cell || y > h + cell) {
        last = null
        return
      }
      // Fill the path between events so fast moves leave a continuous trail.
      if (last) {
        const steps = Math.max(1, Math.ceil(Math.hypot(x - last.x, y - last.y) / (cell * 0.5)))
        for (let s = 1; s <= steps; s++) light(last.x + ((x - last.x) * s) / steps, last.y + ((y - last.y) * s) / steps)
      } else light(x, y)
      last = { x, y }
      wake()
    }

    const draw = (now: number) => {
      raf = 0
      const dt = Math.min(64, now - prev) / 16.67
      prev = now
      if (!reduce && Math.random() < (ambient * dt) / 60) {
        // Ambient pulse: a single cell in one of the app's chart colours.
        const i = Math.floor(Math.random() * cols * rows)
        if (!blocked[i]) {
          energy[i] = 0.55 + Math.random() * 0.45
          hue[i] = 1 + Math.floor(Math.random() * 4)
        }
      }
      ctx.clearRect(0, 0, w, h)
      // Base grid.
      ctx.strokeStyle = 'rgba(255,255,255,0.045)'
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let x = 0; x <= w; x += cell) {
        ctx.moveTo(Math.round(x) + 0.5, 0)
        ctx.lineTo(Math.round(x) + 0.5, h)
      }
      for (let y = 0; y <= h; y += cell) {
        ctx.moveTo(0, Math.round(y) + 0.5)
        ctx.lineTo(w, Math.round(y) + 0.5)
      }
      ctx.stroke()
      let alive = false
      const k = decay ** dt
      for (let i = 0; i < energy.length; i++) {
        const e = energy[i]
        if (e < 0.01) {
          energy[i] = 0
          continue
        }
        alive = true
        const x = (i % cols) * cell
        const y = Math.floor(i / cols) * cell
        const c = COLORS[hue[i]]
        ctx.fillStyle = `rgba(${c},${e * 0.16})`
        ctx.fillRect(x + 1, y + 1, cell - 1, cell - 1)
        ctx.strokeStyle = `rgba(${c},${e * 0.55})`
        ctx.strokeRect(x + 0.5, y + 0.5, cell, cell)
        energy[i] = e * k
      }
      if (visible && (alive || (!reduce && ambient > 0))) raf = requestAnimationFrame(draw)
    }

    const wake = () => {
      if (!raf && visible) {
        prev = performance.now()
        raf = requestAnimationFrame(draw)
      }
    }

    measure()
    wake()
    const ro = new ResizeObserver(() => {
      measure()
      wake()
    })
    ro.observe(host)
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      if (visible) wake()
    })
    io.observe(host)
    window.addEventListener('pointermove', onMove, { passive: true })
    // Fonts and images shift the avoid-rects after first paint.
    const late = setTimeout(measure, 600)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(late)
      ro.disconnect()
      io.disconnect()
      window.removeEventListener('pointermove', onMove)
    }
  }, [cell, radius, decay, ambient])

  return <canvas ref={ref} aria-hidden className={`pointer-events-none absolute inset-0 ${className}`} />
}

/** White for the pointer trail, then the app's chart blue, green, purple and orange for ambient pulses. */
const COLORS = ['226,232,255', '59,130,246', '34,197,94', '167,139,250', '245,158,11']

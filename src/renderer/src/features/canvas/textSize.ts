/**
 * Pure text-size logic shared by the selection toolbar, the node right-click menu and the
 * ⌘⇧. / ⌘⇧, shortcuts. Two kinds of text object use it: headings (`text`, px font size stored as
 * `data.size`) and text blocks (`card` of kind `block`, px font size stored as `data.fontSize`,
 * scaling the block's prose via the `--block-font-size` CSS var — see canvas.css).
 */

export type TextObjectKind = 'heading' | 'block'
export type TextSizePreset = 'S' | 'M' | 'L' | 'XL' | 'XXL'

export const TEXT_SIZE_PRESETS: readonly TextSizePreset[] = ['S', 'M', 'L', 'XL', 'XXL']

/** Font size (px) for each preset, per object kind. M is each kind's long-standing default. */
export const TEXT_SIZE_PX: Record<TextObjectKind, Record<TextSizePreset, number>> = {
  heading: { S: 16, M: 20, L: 28, XL: 40, XXL: 56 },
  block: { S: 12.5, M: 14.5, L: 17, XL: 20, XXL: 24 }
}

export const HEADING_DEFAULT_SIZE = TEXT_SIZE_PX.heading.M
export const BLOCK_DEFAULT_SIZE = TEXT_SIZE_PX.block.M

/** The preset whose px value is closest to `size` (ties favour the smaller preset). */
export function nearestPreset(kind: TextObjectKind, size: number): TextSizePreset {
  const sizes = TEXT_SIZE_PX[kind]
  let best: TextSizePreset = TEXT_SIZE_PRESETS[0]
  let bestDiff = Infinity
  for (const p of TEXT_SIZE_PRESETS) {
    const diff = Math.abs(sizes[p] - size)
    if (diff < bestDiff) {
      best = p
      bestDiff = diff
    }
  }
  return best
}

/** Preset one step bigger/smaller than `preset`, clamped at the ends. */
export function stepPreset(preset: TextSizePreset, dir: 1 | -1): TextSizePreset {
  const i = TEXT_SIZE_PRESETS.indexOf(preset)
  return TEXT_SIZE_PRESETS[Math.max(0, Math.min(TEXT_SIZE_PRESETS.length - 1, i + dir))]
}

/** Next font size (px) when stepping bigger/smaller from the current size (snaps to the nearest preset first). */
export function steppedSize(kind: TextObjectKind, currentSize: number, dir: 1 | -1): number {
  return TEXT_SIZE_PX[kind][stepPreset(nearestPreset(kind, currentSize), dir)]
}

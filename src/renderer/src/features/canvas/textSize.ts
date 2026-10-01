/**
 * Pure text-size logic shared by the selection toolbar, the node right-click menu and the
 * ⌘⇧. / ⌘⇧, shortcuts. Text boxes (`card` of kind `block`) store their px font size as `data.fontSize`,
 * scaling the box's prose via the `--block-font-size` CSS var (see canvas.css); regular cards zoom their content.
 */

export type TextSizePreset = 'XXS' | 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL' | '3XL' | '4XL' | '5XL'

export const TEXT_SIZE_PRESETS: readonly TextSizePreset[] = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL']

/** Font size (px) for each preset. M is the long-standing default. */
export const TEXT_SIZE_PX: Record<TextSizePreset, number> = { XXS: 9, XS: 11, S: 12.5, M: 14.5, L: 17, XL: 20, XXL: 24, '3XL': 30, '4XL': 38, '5XL': 48 }

export const BLOCK_DEFAULT_SIZE = TEXT_SIZE_PX.M

/** The preset whose px value is closest to `size` (ties favour the smaller preset). */
export function nearestPreset(size: number): TextSizePreset {
  let best: TextSizePreset = TEXT_SIZE_PRESETS[0]
  let bestDiff = Infinity
  for (const p of TEXT_SIZE_PRESETS) {
    const diff = Math.abs(TEXT_SIZE_PX[p] - size)
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
export function steppedSize(currentSize: number, dir: 1 | -1): number {
  return TEXT_SIZE_PX[stepPreset(nearestPreset(currentSize), dir)]
}

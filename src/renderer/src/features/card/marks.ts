import { PALETTE } from '@/lib/colors'

/**
 * Colour swatches for the editor. Values are plain CSS colours (never tokens), because they
 * are stored in the document and must round-trip through Markdown and render outside the app.
 */
export const TEXT_COLORS = Object.entries(PALETTE).map(([name, c]) => ({ name, value: c.fg }))

/** Highlights re-use the palette hue at a stronger alpha so text stays readable in both themes. */
export const HIGHLIGHT_COLORS = Object.entries(PALETTE).map(([name, c]) => ({
  name,
  value: c.bg.replace(/\/\s*[\d.]+\)/, '/ 0.3)')
}))

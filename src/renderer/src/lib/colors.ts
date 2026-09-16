/** Palette used by tags, sections and select options. Values are CSS colors usable in both themes. */
export const PALETTE: Record<string, { fg: string; bg: string; border: string }> = {
  gray: { fg: 'oklch(0.5 0 0)', bg: 'oklch(0.6 0 0 / 0.1)', border: 'oklch(0.6 0 0 / 0.35)' },
  red: { fg: 'oklch(0.58 0.19 25)', bg: 'oklch(0.65 0.2 25 / 0.1)', border: 'oklch(0.65 0.2 25 / 0.4)' },
  orange: { fg: 'oklch(0.62 0.16 55)', bg: 'oklch(0.72 0.17 55 / 0.12)', border: 'oklch(0.72 0.17 55 / 0.45)' },
  yellow: { fg: 'oklch(0.62 0.13 90)', bg: 'oklch(0.85 0.16 95 / 0.16)', border: 'oklch(0.8 0.16 95 / 0.55)' },
  green: { fg: 'oklch(0.56 0.14 150)', bg: 'oklch(0.7 0.15 150 / 0.11)', border: 'oklch(0.7 0.15 150 / 0.45)' },
  teal: { fg: 'oklch(0.56 0.1 190)', bg: 'oklch(0.7 0.11 190 / 0.12)', border: 'oklch(0.7 0.11 190 / 0.45)' },
  blue: { fg: 'oklch(0.56 0.16 255)', bg: 'oklch(0.65 0.16 255 / 0.1)', border: 'oklch(0.65 0.16 255 / 0.42)' },
  purple: { fg: 'oklch(0.56 0.17 300)', bg: 'oklch(0.65 0.17 300 / 0.1)', border: 'oklch(0.65 0.17 300 / 0.42)' },
  pink: { fg: 'oklch(0.6 0.18 350)', bg: 'oklch(0.7 0.18 350 / 0.1)', border: 'oklch(0.7 0.18 350 / 0.42)' }
}

export const color = (name: string | null | undefined) => PALETTE[name ?? 'gray'] ?? PALETTE.gray

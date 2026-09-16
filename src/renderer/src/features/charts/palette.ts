/** Chart series colours — tuned to read well on light and dark surfaces. */
export const CHART_COLORS = [
  'oklch(0.62 0.17 255)', // blue
  'oklch(0.68 0.16 160)', // green
  'oklch(0.72 0.16 60)', // orange
  'oklch(0.6 0.18 300)', // purple
  'oklch(0.65 0.2 15)', // red
  'oklch(0.7 0.12 200)', // teal
  'oklch(0.75 0.14 95)', // yellow
  'oklch(0.66 0.19 340)' // pink
]

export const colorAt = (i: number) => CHART_COLORS[i % CHART_COLORS.length]

export const SCHEMES = {
  blue: 'oklch(0.58 0.17 255)',
  green: 'oklch(0.6 0.15 155)',
  orange: 'oklch(0.68 0.17 55)',
  purple: 'oklch(0.55 0.18 300)'
} as const

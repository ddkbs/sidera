export const now = (): number => Date.now()

export function todayISO(d = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export const TAG_COLORS = ['gray', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink'] as const
export type TagColor = (typeof TAG_COLORS)[number]

/** Fractional index between two neighbours for stable manual ordering. */
export function between(before: number | undefined, after: number | undefined): number {
  if (before === undefined && after === undefined) return 1
  if (before === undefined) return after! - 1
  if (after === undefined) return before + 1
  return (before + after) / 2
}

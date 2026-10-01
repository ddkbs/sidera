import { getLang } from '@/lib/i18n'

/**
 * German for the sample content of newly inserted charts and tables (`defaultChart` / `emptyTable` in shared
 * are English). Only exact matches are replaced; once inserted, the content is the user's.
 */
const DE: Record<string, string> = {
  // chart titles
  'Column chart': 'Säulendiagramm',
  'Bar chart': 'Balkendiagramm',
  'Line chart': 'Liniendiagramm',
  'Area chart': 'Flächendiagramm',
  'Column + line': 'Säulen + Linie',
  'Radar chart': 'Netzdiagramm',
  'Pie chart': 'Kreisdiagramm',
  'Donut chart': 'Ringdiagramm',
  'Scatter plot': 'Streudiagramm',
  'Bubble chart': 'Blasendiagramm',
  'Sankey diagram': 'Sankey-Diagramm',
  Timeline: 'Zeitleiste',
  '2×2 matrix': '2×2-Matrix',
  'Venn diagram': 'Venn-Diagramm',
  Skills: 'Fähigkeiten',
  'Focus hours': 'Fokusstunden',
  'Revenue & growth': 'Umsatz & Wachstum',
  Revenue: 'Umsatz',
  'Time spent': 'Zeitaufwand',
  'Effort vs impact': 'Aufwand vs. Wirkung',
  Markets: 'Märkte',
  'Budget flow': 'Budgetfluss',
  'Launch plan': 'Launch-Plan',
  Prioritization: 'Priorisierung',
  'Product sweet spot': 'Produkt-Sweetspot',
  // columns
  Skill: 'Fähigkeit',
  Week: 'Woche',
  Month: 'Monat',
  'Growth %': 'Wachstum %',
  Label: 'Beschriftung',
  Value: 'Wert',
  Group: 'Gruppe',
  Size: 'Größe',
  From: 'Von',
  To: 'Nach',
  Date: 'Datum',
  Title: 'Titel',
  Item: 'Eintrag',
  Region: 'Bereich',
  Name: 'Name',
  // cells & options
  Writing: 'Schreiben',
  Research: 'Recherche',
  Sales: 'Vertrieb',
  Mon: 'Mo',
  Tue: 'Di',
  Wed: 'Mi',
  Thu: 'Do',
  Fri: 'Fr',
  Mar: 'Mär',
  May: 'Mai',
  'Deep work': 'Fokusarbeit',
  Meetings: 'Meetings',
  Learning: 'Lernen',
  'Quick wins': 'Schnelle Erfolge',
  'Big bets': 'Große Wetten',
  Core: 'Kern',
  Growth: 'Wachstum',
  Product: 'Produkt',
  Ops: 'Betrieb',
  Engineering: 'Entwicklung',
  Ads: 'Anzeigen',
  Content: 'Inhalte',
  'Scope & team': 'Umfang & Team',
  Prototype: 'Prototyp',
  'Clickable demo': 'Klickbare Demo',
  '50 testers': '50 Tester',
  'Public release': 'Öffentliche Veröffentlichung',
  'Onboarding tour': 'Einführungstour',
  'Dark mode tweaks': 'Dunkelmodus-Feinschliff',
  'Rewrite editor': 'Editor neu schreiben',
  Desirable: 'Begehrenswert',
  Feasible: 'Machbar',
  Viable: 'Tragfähig',
  'Sweet spot': 'Sweetspot',
  'Low effort': 'Wenig Aufwand',
  'High effort': 'Viel Aufwand',
  'Low impact': 'Wenig Wirkung',
  'High impact': 'Viel Wirkung',
  'Fill-ins': 'Lückenfüller',
  'Money pits': 'Geldgräber'
}

/** Deep-copies `value`, translating known sample strings into the UI language. */
export function localizeSample<T>(value: T): T {
  if (getLang() !== 'de') return value
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return DE[v] ?? v
    if (Array.isArray(v)) return v.map(walk)
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]))
    return v
  }
  return walk(value) as T
}

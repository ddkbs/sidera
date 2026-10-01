import { APP_NAME } from '@shared/brand'
import type { Lang } from '@shared/i18n'
import { arrow, loop, seedInk, underline } from '@shared/inkSeed'
import { tableFromMatrix, tableToChart } from '@shared/tables'
import type { Services } from './index'

const BLUE = '#1971c2'
const RED = '#e03131'

/** Texts of the welcome board per UI language. */
const TEXT: Record<Lang, {
  title: string
  intro: string
  write: string
  pen: string
  ipad: string
  tip: string
  table: { month: string; notes: string; title: string; months: string[] }
  chartHint: string
}> = {
  en: {
    title: `Welcome to ${APP_NAME}`,
    intro: 'Fast, visual notes on an infinite whiteboard. Everything on this board is editable — click around, then make it yours.',
    write: '**Double-click anywhere to write**\n\nA text box appears right where you click. Press **T** for the text tool or **⌘N** for a new text box.',
    pen: '**Press P to draw**\n\nUnderline, circle, sketch — the pen draws straight onto the board. **Esc** puts it away.',
    ipad: '**⇧⌘D to draw on your iPad**\n\nScan the QR code and sketch with Apple Pencil. End-to-end encrypted, over your own Wi-Fi.',
    tip: '**Tip:** ⌘K finds any board or note. **Ask AI** (⌘J) can build boards for you — or connect Claude Desktop and Claude Code through the local MCP server.',
    table: { month: 'Month', notes: 'Notes', title: 'Notes per month', months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'] },
    chartHint: 'Change a number in the table — the chart follows. Select a table → **Create chart** for another view.'
  },
  de: {
    title: `Willkommen bei ${APP_NAME}`,
    intro: 'Schnelle, visuelle Notizen auf einem unendlichen Whiteboard. Alles auf diesem Board ist bearbeitbar – klick dich durch und mach es zu deinem.',
    write: '**Doppelklick irgendwo zum Schreiben**\n\nGenau dort erscheint ein Textfeld. **T** wählt das Textwerkzeug, **⌘N** erstellt ein neues Textfeld.',
    pen: '**Drück P zum Zeichnen**\n\nUnterstreichen, einkreisen, skizzieren – der Stift zeichnet direkt aufs Board. **Esc** legt ihn weg.',
    ipad: '**⇧⌘D zum Zeichnen auf dem iPad**\n\nScanne den QR-Code und skizziere mit dem Apple Pencil. Ende-zu-Ende-verschlüsselt, über dein eigenes WLAN.',
    tip: '**Tipp:** ⌘K findet jedes Board und jede Notiz. **KI fragen** (⌘J) baut Boards für dich – oder verbinde Claude Desktop und Claude Code über den lokalen MCP-Server.',
    table: { month: 'Monat', notes: 'Notizen', title: 'Notizen pro Monat', months: ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun'] },
    chartHint: 'Ändere eine Zahl in der Tabelle – das Diagramm zieht mit. Tabelle auswählen → **Diagramm erstellen** für eine weitere Ansicht.'
  }
}

/**
 * Creates the "Welcome to Sidera" board on first launch (empty database only), in the UI language.
 * Returns the new board's id, or null if nothing was seeded.
 * It is built from the everyday building blocks — text boxes, a table with a linked chart and pen
 * ink — so the first thing people see is what a board looks like, and every piece on it is editable.
 */
export function seedWelcome(api: Services, lang: Lang = 'en'): string | null {
  if (api.listWhiteboards().length || api.listCards({ limit: 1, kind: 'all' }).length) return null
  const board = api.createWhiteboard({ name: TEXT[lang].title })
  populate(api, board.id, lang)
  return board.id
}

/** Rebuilds a (still untouched) welcome board in another language, keeping its id so open tabs stay valid. */
export function relocalizeWelcome(api: Services, boardId: string, lang: Lang): boolean {
  const board = api.getWhiteboard(boardId)
  if (!board) return false
  if (board.objects.length) api.removeObjects(board.objects.map((o) => o.id))
  api.updateWhiteboard({ id: boardId, name: TEXT[lang].title })
  populate(api, boardId, lang)
  return true
}

function populate(api: Services, w: string, lang: Lang): void {
  const tx = TEXT[lang]
  const block = (x: number, y: number, markdown: string, width = 340, style: 'plain' | 'framed' = 'plain') =>
    api.addTextBlock({ whiteboardId: w, x, y, width, markdown, style })

  // ── title ─────────────────────────────────────────────────────────────────
  api.addTextBlock({ whiteboardId: w, x: 0, y: 0, width: 560, markdown: `# ${tx.title}`, fontSize: 28 })
  block(4, 74, tx.intro, 520)

  // ── the basics, as text blocks ──────────────────────────────────────────────
  block(4, 184, tx.write)
  block(4, 314, tx.pen)
  block(4, 444, tx.ipad)
  block(4, 584, tx.tip, 340, 'framed')

  // ── a table with a chart that follows it ──────────────────────────────────
  const values = [12, 19, 17, 26, 31, 44]
  const data = tableFromMatrix(
    [tx.table.month, { name: tx.table.notes, type: 'number' }],
    tx.table.months.map((m, i) => [m, values[i]]),
    tx.table.title
  )
  const table = api.addObject({ whiteboardId: w, kind: 'table', x: 420, y: 184, width: 260, height: 290, data: data as unknown as Record<string, unknown> })
  const chart = tableToChart(data, { chartType: 'column', title: tx.table.title, options: { legend: false } })
  api.addObject({
    whiteboardId: w,
    kind: 'chart',
    x: 720,
    y: 184,
    width: 420,
    height: 290,
    data: { ...chart, source: { tableId: table.id } } as unknown as Record<string, unknown>
  })
  block(840, 530, tx.chartHint, 300)

  // ── pen ink: an underline, a circled bar and an arrow, drawn like pen mode would ─────────────────────
  const inks = [
    seedInk([{ points: underline(250, 386, 66, 3), color: BLUE, width: 4.5 }], 'welcome-underline'),
    seedInk(
      [
        { points: loop(1088, 292, 44, 30, 5), color: RED, width: 4.5 },
        ...arrow([1150, 528], [1136, 318], 34).map((points) => ({ points, color: RED, width: 4.5 }))
      ],
      'welcome-circle'
    )
  ]
  for (const ink of inks) api.addObject({ whiteboardId: w, kind: 'sketch', ...ink.box, data: { elements: ink.elements, files: {}, frameless: true } })
}

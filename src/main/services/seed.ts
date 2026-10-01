import { APP_NAME } from '@shared/brand'
import { arrow, loop, seedInk, underline } from '@shared/inkSeed'
import { tableFromMatrix, tableToChart } from '@shared/tables'
import type { Services } from './index'

const BLUE = '#1971c2'
const RED = '#e03131'

/**
 * Creates the "Welcome to Sidera" board on first launch (empty database only). Returns true if seeded.
 * It is built from the everyday building blocks — text boxes, a table with a linked chart and pen
 * ink — so the first thing people see is what a board looks like, and every piece on it is editable.
 */
export function seedWelcome(api: Services): boolean {
  if (api.listWhiteboards().length || api.listCards({ limit: 1, kind: 'all' }).length) return false

  const board = api.createWhiteboard({ name: `Welcome to ${APP_NAME}` })
  const w = board.id
  const block = (x: number, y: number, markdown: string, width = 340, style: 'plain' | 'framed' = 'plain') =>
    api.addTextBlock({ whiteboardId: w, x, y, width, markdown, style })

  // ── title ─────────────────────────────────────────────────────────────────
  api.addTextBlock({ whiteboardId: w, x: 0, y: 0, width: 560, markdown: `# Welcome to ${APP_NAME}`, fontSize: 28 })
  block(4, 74, 'Fast, visual notes on an infinite whiteboard. Everything on this board is editable — click around, then make it yours.', 520)

  // ── the basics, as text blocks ──────────────────────────────────────────────
  block(4, 184, '**Double-click anywhere to write**\n\nA text box appears right where you click. Press **T** for the text tool or **⌘N** for a new text box.')
  block(4, 314, '**Press P to draw**\n\nUnderline, circle, sketch — the pen draws straight onto the board. **Esc** puts it away.')
  block(4, 444, '**⇧⌘D to draw on your iPad**\n\nScan the QR code and sketch with Apple Pencil. End-to-end encrypted, over your own Wi-Fi.')
  block(
    4,
    584,
    '**Tip:** ⌘K finds any board or note. **Ask AI** (⌘J) can build boards for you — or connect Claude Desktop and Claude Code through the local MCP server.',
    340,
    'framed'
  )

  // ── a table with a chart that follows it ──────────────────────────────────
  const data = tableFromMatrix(
    ['Month', { name: 'Notes', type: 'number' }],
    [['Jan', 12], ['Feb', 19], ['Mar', 17], ['Apr', 26], ['May', 31], ['Jun', 44]],
    'Notes per month'
  )
  const table = api.addObject({ whiteboardId: w, kind: 'table', x: 420, y: 184, width: 260, height: 290, data: data as unknown as Record<string, unknown> })
  const chart = tableToChart(data, { chartType: 'column', title: 'Notes per month', options: { legend: false } })
  api.addObject({
    whiteboardId: w,
    kind: 'chart',
    x: 720,
    y: 184,
    width: 420,
    height: 290,
    data: { ...chart, source: { tableId: table.id } } as unknown as Record<string, unknown>
  })
  block(840, 530,'Change a number in the table — the chart follows. Select a table → **Create chart** for another view.', 300)

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
  return true
}

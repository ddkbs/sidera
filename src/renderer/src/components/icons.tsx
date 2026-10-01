/**
 * App icon set (Obra Icons). Import icons from here, never from an icon package directly,
 * so the whole app stays visually consistent and can be re-skinned in one place.
 */
import type { ComponentType, ReactNode, SVGProps } from 'react'
import {
  IconAdd,
  IconAddRoundrect,
  IconLightbulb as ObraLightbulb,
  IconRocketShip as ObraRocket,
  IconTarget as ObraTarget,
  IconFavorite as ObraStar,
  IconHeart as ObraHeart,
  IconFire as ObraFire,
  IconBolt as ObraBolt,
  IconFlag as ObraFlag,
  IconPin as ObraPin,
  IconBookmark as ObraBookmark,
  IconMedal as ObraTrophy,
  IconCompass as ObraCompass,
  IconGlobe as ObraGlobe,
  IconBriefcase as ObraBriefcase,
  IconUsers as ObraUsers,
  IconMegaphone as ObraMegaphone,
  IconCoffee as ObraCoffee,
  IconMusicalNoteSingle as ObraMusic,
  IconLock as ObraLock,
  IconLogOut,
  IconBug as ObraBug,
  IconBarChart,
  IconBarChartBox,
  IconLineChartUp,
  IconLineChartFill,
  IconInsights,
  IconTarget,
  IconPieChart3Parts,
  IconPieChartSinglePart,
  IconChartScatter,
  IconAtom,
  IconGridFill,
  IconTransfer,
  IconGanttChart,
  IconLayout as IconMatrixLayout,
  IconBooleanUnion,
  IconAlignTextLeft,
  IconArrowDown,
  IconArrowLeft,
  IconArrowRight,
  IconArrowRightUp,
  IconArrowUp,
  IconArticle,
  IconPresentation,
  IconBookOpen,
  IconCalendarDates,
  IconCards,
  IconChatAi,
  IconCheck,
  IconCheckboxOn,
  IconChecklist,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronUp,
  IconCircle,
  IconCircleCheck,
  IconCircleClose,
  IconCircleInfo,
  IconClose,
  IconCode,
  IconCommand,
  IconCopy,
  IconTablet,
  IconQrCodeScan,
  IconWifi,
  IconWifiOff,
  IconCursor,
  IconDelete,
  IconDocument,
  IconDownload,
  IconExpand,
  IconFullscreen,
  IconHashtag,
  IconHome,
  IconKanban,
  IconKey,
  IconLayout,
  IconLink,
  IconMap,
  IconMarqueeSelection,
  IconMessageSquare,
  IconMoon,
  IconOptionsHorizontal,
  IconOptionsVertical,
  IconOrderedList,
  IconPaperclip,
  IconPen,
  IconPencil,
  IconQuoteFill,
  IconRadioOn,
  IconRotate,
  IconSearch,
  IconSend,
  IconServer,
  IconSettings,
  IconSidebar,
  IconSidebarFillRight,
  IconZoomIn,
  IconZoomOut,
  IconSitemap,
  IconSparkles,
  IconStop,
  IconSubtract,
  IconSun,
  IconTable,
  IconText,
  IconUnorderedList,
  IconUpload,
  IconVerticalAlignBottom,
  IconVerticalAlignTop,
  IconWarningTriangle,
  IconWorkflow,
  IconWrench,
  IconUser,
  IconUserAdd,
  IconNotification,
  IconKeyboard,
  IconComputerMonitor,
  IconImage,
  IconPalette,
  IconFolder,
  IconFolderFill,
  IconFolderAdd,
  IconFilter,
  IconLayers,
  IconSliders,
  IconInbox,
  IconUserEncircled,
  IconCalendarCheck,
  IconClock3,
  IconHistory,
  IconExternalLink,
  IconThreeRows,
  IconBold,
  IconItalic,
  IconUnderline,
  IconStrikethrough,
  IconFatMarker,
  IconEraser,
  IconNote,
  IconFrame,
  IconUnlink
} from 'obra-icons-react'

export type AppIcon = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>

/** Text glyph icons for heading levels (no pictogram represents these well). */
const heading = (level: number): AppIcon =>
  function HeadingIcon({ size = 24, className, style }) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" className={className} style={style} fill="currentColor">
        <text x="2" y="17" fontSize="14" fontWeight="600" fontFamily="inherit">
          H
        </text>
        <text x="13" y="19" fontSize="9" fontWeight="600" fontFamily="inherit">
          {level}
        </text>
      </svg>
    )
  }

// Semantic / legacy names used throughout the app
export const ArrowDown = IconArrowDown
export const ArrowDownToLine = IconVerticalAlignBottom
export const ArrowLeft = IconArrowLeft
export const ArrowRight = IconArrowRight
export const ArrowUp = IconArrowUp
export const ArrowUpRight = IconArrowRightUp
export const ArrowUpToLine = IconVerticalAlignTop
export const AskAI = IconChatAi
export const BookOpen = IconBookOpen
export const BoxSelect = IconMarqueeSelection
export const Calendar = IconCalendarDates
export const CalendarDays = IconCalendarDates
export const Check = IconCheck
export const CheckSquare = IconCheckboxOn
export const ChevronDown = IconChevronDown
export const ChevronLeft = IconChevronLeft
export const ChevronRight = IconChevronRight
export const ChevronUp = IconChevronUp
export const Circle = IconCircle
export const CircleCheck = IconCircleCheck
export const CircleDot = IconRadioOn
export const CircleInfo = IconCircleInfo
export const CircleX = IconCircleClose
export const Code = IconCode
export const Columns3 = IconKanban
export const Command = IconCommand
export const Copy = IconCopy
export const Download = IconDownload
export const Ellipsis = IconOptionsHorizontal
export const Expand = IconExpand
export const File = IconDocument
export const Folder = IconFolder
export const FolderFilled = IconFolderFill
export const FolderPlus = IconFolderAdd
export const FileText = IconArticle
export const GitBranch = IconLayout
export const GripVertical = IconOptionsVertical
export const Hash = IconHashtag
export const Heading1 = heading(1)
export const Heading2 = heading(2)
export const Heading3 = heading(3)
export const Home = IconHome
export const KeyRound = IconKey
export const LayoutDashboard = IconPresentation
export const Library = IconCards
export const Link2 = IconLink
export const List = IconUnorderedList
export const ListChecks = IconChecklist
export const ListOrdered = IconOrderedList
export const Map = IconMap
export const Maximize = IconFullscreen
export const Minus = IconSubtract
export const Moon = IconMoon
export const MessageSquare = IconMessageSquare
export const MoreHorizontal = IconOptionsHorizontal
export const MousePointer2 = IconCursor
export const Network = IconSitemap
export const Palette = IconPalette
export const PanelLeft = IconSidebar
export const PanelRight = IconSidebarFillRight
// Highlighter is exported below (IconFatMarker)
export const ZoomIn = IconZoomIn
export const ZoomOut = IconZoomOut
export const Paperclip = IconPaperclip
export const PenTool = IconPen
export const Pencil = IconPencil
export const Plus = IconAdd
export const Quote = IconQuoteFill
export const RotateCcw = IconRotate
export const Search = IconSearch
export const Send = IconSend
export const Server = IconServer
export const Settings = IconSettings
export const Sparkles = IconSparkles
export const Square = IconStop
export const SquarePlus = IconAddRoundrect
export const Sun = IconSun
export const Table2 = IconTable
/** A text block on a whiteboard (card-backed note). */
export const TextBlock = IconNote
/** "Framed" text block style. */
export const Frame = IconFrame
export const Unlink = IconUnlink
export const Text = IconAlignTextLeft
export const Trash2 = IconDelete
export const TriangleAlert = IconWarningTriangle
export const Type = IconText
export const Upload = IconUpload
export const User = IconUser
export const UserPlus = IconUserAdd
export const Bell = IconNotification
export const Keyboard = IconKeyboard
export const Monitor = IconComputerMonitor
export const ImageIcon = IconImage
export const Workflow = IconWorkflow
export const Wrench = IconWrench
export const X = IconClose

// Rich-text formatting (card editor bubble menu)
export const Bold = IconBold
export const Italic = IconItalic
export const Underline = IconUnderline
export const Strikethrough = IconStrikethrough
export const Highlighter = IconFatMarker
export const Eraser = IconEraser

// Charts & diagrams
export const BarChart = IconBarChart
export const ChartsMenu = IconBarChartBox
export const LineChart = IconLineChartUp
export const AreaChart = IconLineChartFill
export const ComboChart = IconInsights
export const RadarChart = IconTarget
export const PieChart = IconPieChart3Parts
export const DonutChart = IconPieChartSinglePart
export const ScatterChart = IconChartScatter
export const BubbleChart = IconAtom
export const Heatmap = IconGridFill
export const SankeyChart = IconTransfer
export const TimelineChart = IconGanttChart
export const MatrixChart = IconMatrixLayout
export const VennChart = IconBooleanUnion

// Card icon set
export const Lightbulb = ObraLightbulb
export const Rocket = ObraRocket
export const Target = ObraTarget
export const Star = ObraStar
export const Heart = ObraHeart
export const Fire = ObraFire
export const Bolt = ObraBolt
export const Flag = ObraFlag
export const Pin = ObraPin
export const Bookmark = ObraBookmark
export const Trophy = ObraTrophy
export const Compass = ObraCompass
export const Globe = ObraGlobe
export const Briefcase = ObraBriefcase
export const Users = ObraUsers
export const Megaphone = ObraMegaphone
export const Coffee = ObraCoffee
export const Music = ObraMusic
export const Lock = ObraLock
export const LogOut = IconLogOut
export const Bug = ObraBug

// Sidera for iPad
export const Tablet = IconTablet
export const QrCode = IconQrCodeScan
export const Wifi = IconWifi
export const WifiOff = IconWifiOff

/** Obra has no undo/redo glyph — drawn in the same 24px, 1.5-stroke style. */
const turnArrow = (flip: boolean): AppIcon =>
  function TurnArrowIcon({ size = 24, className, style }) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" className={className} style={{ ...style, transform: flip ? 'scaleX(-1)' : undefined }} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 14 4 9l5-5" />
        <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
      </svg>
    )
  }
export const Undo2 = turnArrow(false)
export const Redo2 = turnArrow(true)

// Tasks
export const Filter = IconFilter
export const Layers = IconLayers
export const SlidersHorizontal = IconSliders
export const Inbox = IconInbox
export const UserCircle = IconUserEncircled
export const CalendarCheck = IconCalendarCheck
export const Clock = IconClock3
export const History = IconHistory
export const ExternalLink = IconExternalLink
export const Rows = IconThreeRows

type GlyphProps = SVGProps<SVGSVGElement> & { size?: number }
const glyph = (name: string, draw: () => ReactNode): AppIcon => {
  function Glyph({ size = 16, className, style }: GlyphProps) {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" className={className} style={style} fill="none" aria-hidden>
        {draw()}
      </svg>
    )
  }
  Glyph.displayName = name
  return Glyph
}

/** Task status glyphs (Linear-style rings) — 16px grid, color via currentColor. */
export const StatusTodo = glyph('StatusTodo', () => <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2.2 1.9" />)
export const StatusInProgress = glyph('StatusInProgress', () => (
  <>
    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
    <path d="M8 4.5a3.5 3.5 0 0 1 0 7z" fill="currentColor" />
  </>
))
export const StatusDone = glyph('StatusDone', () => (
  <>
    <circle cx="8" cy="8" r="6.75" fill="currentColor" />
    <path d="m5.3 8.2 1.8 1.8 3.6-3.8" stroke="var(--background, #fff)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </>
))

/** Priority glyphs: signal bars, dashes for none, filled badge for urgent. */
const bars = (name: string, level: number): AppIcon =>
  glyph(name, () => (
    <>
      {[0, 1, 2].map((i) => (
        <rect key={i} x={2.5 + i * 4} y={10 - i * 3} width="3" height={4 + i * 3} rx="1" fill="currentColor" opacity={i < level ? 1 : 0.28} />
      ))}
    </>
  ))
export const PriorityNone = glyph('PriorityNone', () => (
  <>
    {[0, 1, 2].map((i) => (
      <rect key={i} x={2.5 + i * 4} y="7.25" width="3" height="1.5" rx=".75" fill="currentColor" opacity=".55" />
    ))}
  </>
))
export const PriorityLow = bars('PriorityLow', 1)
export const PriorityMedium = bars('PriorityMedium', 2)
export const PriorityHigh = bars('PriorityHigh', 3)
export const PriorityUrgent = glyph('PriorityUrgent', () => (
  <>
    <rect x="1.5" y="1.5" width="13" height="13" rx="3.5" fill="currentColor" />
    <path d="M8 4.5v4.25" stroke="var(--background, #fff)" strokeWidth="1.75" strokeLinecap="round" />
    <circle cx="8" cy="11.25" r="1" fill="var(--background, #fff)" />
  </>
))

// Flowchart editor

const stroke = { stroke: 'currentColor', strokeWidth: 1.4, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const }
/** Node shape glyphs (16px), keyed by the shared flowchart shape names. */
export const FlowShapeIcons: Record<string, AppIcon> = {
  rect: glyph('ShapeRect', () => <rect x="2" y="4" width="12" height="8" rx="0.5" {...stroke} />),
  round: glyph('ShapeRound', () => <rect x="2" y="4" width="12" height="8" rx="2.5" {...stroke} />),
  stadium: glyph('ShapeStadium', () => <rect x="1.5" y="4" width="13" height="8" rx="4" {...stroke} />),
  circle: glyph('ShapeCircle', () => <circle cx="8" cy="8" r="5.5" {...stroke} />),
  diamond: glyph('ShapeDiamond', () => <path d="M8 2 14 8 8 14 2 8Z" {...stroke} />),
  hexagon: glyph('ShapeHexagon', () => <path d="M4.5 3.5h7L14.5 8l-3 4.5h-7L1.5 8Z" {...stroke} />),
  parallelogram: glyph('ShapeParallelogram', () => <path d="M4.5 4H15l-3.5 8H1Z" {...stroke} />),
  database: glyph('ShapeDatabase', () => (
    <>
      <ellipse cx="8" cy="4" rx="5" ry="1.8" {...stroke} />
      <path d="M3 4v8c0 1 2.2 1.8 5 1.8s5-.8 5-1.8V4" {...stroke} />
    </>
  )),
  subroutine: glyph('ShapeSubroutine', () => (
    <>
      <rect x="1.5" y="4" width="13" height="8" {...stroke} />
      <path d="M4 4v8M12 4v8" {...stroke} />
    </>
  )),
  'parallelogram-alt': glyph('ShapeParallelogramAlt', () => <path d="M1 4h10.5L15 12H4.5Z" {...stroke} />),
  trapezoid: glyph('ShapeTrapezoid', () => <path d="M4.5 4h7l3 8h-13Z" {...stroke} />),
  'trapezoid-alt': glyph('ShapeTrapezoidAlt', () => <path d="M1.5 4h13l-3 8h-7Z" {...stroke} />),
  asymmetric: glyph('ShapeFlag', () => <path d="M1.5 4H14.5v8H1.5l3-4Z" {...stroke} />),
  'double-circle': glyph('ShapeDoubleCircle', () => (
    <>
      <circle cx="8" cy="8" r="6" {...stroke} />
      <circle cx="8" cy="8" r="3.8" {...stroke} />
    </>
  ))
}

/** Connection line styles and arrow heads. */
export const LineSolid = glyph('LineSolid', () => <path d="M2 8h12" {...stroke} />)
export const LineDotted = glyph('LineDotted', () => <path d="M2 8h12" {...stroke} strokeDasharray="1.5 2.2" />)
export const LineThick = glyph('LineThick', () => <path d="M2 8h12" {...stroke} strokeWidth={3} />)
export const ArrowHeadNone = glyph('ArrowHeadNone', () => <path d="M2 8h12" {...stroke} />)
export const ArrowHeadEnd = glyph('ArrowHeadEnd', () => <path d="M2 8h11.5M10 5l3.5 3-3.5 3" {...stroke} />)
export const ArrowHeadBoth = glyph('ArrowHeadBoth', () => <path d="M2.5 8h11M6 5 2.5 8 6 11M10 5l3.5 3-3.5 3" {...stroke} />)

/** Align / distribute glyphs for the canvas selection toolbar (16px grid). */
const guide = { stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round' as const, opacity: 0.55 }
const bar = { fill: 'currentColor' }
export const AlignLeft = glyph('AlignLeft', () => (
  <>
    <path d="M2 2.5v11" {...guide} />
    <rect x="4" y="4" width="10" height="3" rx="1" {...bar} />
    <rect x="4" y="9" width="6" height="3" rx="1" {...bar} />
  </>
))
export const AlignCenterH = glyph('AlignCenterH', () => (
  <>
    <path d="M8 2.5v11" {...guide} />
    <rect x="3" y="4" width="10" height="3" rx="1" {...bar} />
    <rect x="5" y="9" width="6" height="3" rx="1" {...bar} />
  </>
))
export const AlignRight = glyph('AlignRight', () => (
  <>
    <path d="M14 2.5v11" {...guide} />
    <rect x="2" y="4" width="10" height="3" rx="1" {...bar} />
    <rect x="6" y="9" width="6" height="3" rx="1" {...bar} />
  </>
))
export const AlignTop = glyph('AlignTop', () => (
  <>
    <path d="M2.5 2h11" {...guide} />
    <rect x="4" y="4" width="3" height="10" rx="1" {...bar} />
    <rect x="9" y="4" width="3" height="6" rx="1" {...bar} />
  </>
))
export const AlignMiddleV = glyph('AlignMiddleV', () => (
  <>
    <path d="M2.5 8h11" {...guide} />
    <rect x="4" y="3" width="3" height="10" rx="1" {...bar} />
    <rect x="9" y="5" width="3" height="6" rx="1" {...bar} />
  </>
))
export const AlignBottom = glyph('AlignBottom', () => (
  <>
    <path d="M2.5 14h11" {...guide} />
    <rect x="4" y="2" width="3" height="10" rx="1" {...bar} />
    <rect x="9" y="6" width="3" height="6" rx="1" {...bar} />
  </>
))
export const DistributeH = glyph('DistributeH', () => (
  <>
    <path d="M2 2.5v11M14 2.5v11" {...guide} />
    <rect x="6.5" y="4" width="3" height="8" rx="1" {...bar} />
    <rect x="3" y="4" width="1.6" height="8" rx=".8" fill="currentColor" opacity=".55" />
    <rect x="11.4" y="4" width="1.6" height="8" rx=".8" fill="currentColor" opacity=".55" />
  </>
))
export const DistributeV = glyph('DistributeV', () => (
  <>
    <path d="M2.5 2h11M2.5 14h11" {...guide} />
    <rect x="4" y="6.5" width="8" height="3" rx="1" {...bar} />
    <rect x="4" y="3" width="8" height="1.6" rx=".8" fill="currentColor" opacity=".55" />
    <rect x="4" y="11.4" width="8" height="1.6" rx=".8" fill="currentColor" opacity=".55" />
  </>
))
export const GridLayout = glyph('GridLayout', () => (
  <>
    {[2, 9].map((x) => [2, 9].map((y) => <rect key={`${x}-${y}`} x={x} y={y} width="5" height="5" rx="1.2" {...bar} />))}
  </>
))
export const TidyUp = glyph('TidyUp', () => (
  <>
    <path d="M2 2.5v11" {...guide} />
    <rect x="4.5" y="3" width="9" height="3.5" rx="1.2" {...bar} />
    <rect x="4.5" y="9.5" width="6" height="3.5" rx="1.2" fill="currentColor" opacity=".55" />
  </>
))

// Shapes insert menu (16px, matches what gets inserted on the board)
export const ShapeRectangle = glyph('ShapeRectangle', () => <rect x="2" y="4" width="12" height="8" rx="1" {...stroke} />)
export const ShapeEllipse = glyph('ShapeEllipse', () => <ellipse cx="8" cy="8" rx="6" ry="4.5" {...stroke} />)
export const ShapeDiamond = glyph('ShapeDiamond', () => <path d="M8 2 14 8 8 14 2 8Z" {...stroke} />)
export const ShapeLine = glyph('ShapeLine', () => <path d="M2.5 12 13.5 4" {...stroke} />)
export const ShapeArrow = glyph('ShapeArrow', () => <path d="M2.5 12 13 4.2M8 3.6l5-.2.4 4.8" {...stroke} />)
export const ShapeCurve = glyph('ShapeCurve', () => <path d="M2 11C4 3 6 3 8 8s4 5 6-3" {...stroke} />)
export const ShapeSemicircle = glyph('ShapeSemicircle', () => <path d="M2.5 11a5.5 5.5 0 0 1 11 0" {...stroke} />)
export const ShapeCurvedArrow = glyph('ShapeCurvedArrow', () => <path d="M2.5 12C4 5 10 3 13.5 5M9.6 3.1l4 1.7-1.1 4" {...stroke} />)
export const ShapeCross = glyph('ShapeCross', () => <path d="M3 3l10 10M13 3 3 13" {...stroke} />)
export const ShapeCheck = glyph('ShapeCheck', () => <path d="M2.5 8.5 6 12l7.5-8" {...stroke} strokeWidth={1.8} />)
export const ShapesMenu = glyph('ShapesMenu', () => (
  <>
    <rect x="1.5" y="8.5" width="6" height="6" rx="1" {...stroke} />
    <circle cx="11" cy="5" r="3.5" {...stroke} />
  </>
))
export const ShapeStar = glyph('ShapeStar', () => (
  <path
    d="M8 1.5 9.8 5.9 14.5 6.3 10.9 9.3 12 13.9 8 11.4 4 13.9 5.1 9.3 1.5 6.3 6.2 5.9Z"
    {...stroke}
    strokeLinejoin="round"
  />
))

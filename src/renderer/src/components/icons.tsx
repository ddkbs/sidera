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
  IconThreeRows
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
export const ArrowDownToLine = IconVerticalAlignBottom
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
export const Bug = ObraBug

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

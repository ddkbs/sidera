/**
 * App icon set (Obra Icons). Import icons from here, never from an icon package directly,
 * so the whole app stays visually consistent and can be re-skinned in one place.
 */
import type { ComponentType, SVGProps } from 'react'
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
  IconMoon,
  IconOptionsHorizontal,
  IconOptionsVertical,
  IconOrderedList,
  IconPen,
  IconPencil,
  IconQuoteFill,
  IconRadioOn,
  IconRotate,
  IconSearch,
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
  IconPalette,
  IconFolder,
  IconFolderFill,
  IconFolderAdd
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
export const MoreHorizontal = IconOptionsHorizontal
export const MousePointer2 = IconCursor
export const Network = IconSitemap
export const Palette = IconPalette
export const PanelLeft = IconSidebar
export const PenTool = IconPen
export const Pencil = IconPencil
export const Plus = IconAdd
export const Quote = IconQuoteFill
export const RotateCcw = IconRotate
export const Search = IconSearch
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

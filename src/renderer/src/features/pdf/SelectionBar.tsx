import { motion } from 'motion/react'
import { Copy, SquarePlus, Trash2 } from '@/components/icons'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { color } from '@/lib/colors'
import { cn } from '@/lib/utils'
import { HIGHLIGHT_COLORS, fillOf } from './highlight'

/**
 * The bar that pops up at the bottom of the reader while text is selected (or a saved
 * highlight is picked): colour swatches, copy, "create card" (also a drag handle), remove.
 */
export function SelectionBar({
  activeColor,
  canRemove,
  onColor,
  onCopy,
  onCreateCard,
  onDragCard,
  onRemove
}: {
  activeColor: string | null
  canRemove: boolean
  onColor: (c: string) => void
  onCopy: () => void
  onCreateCard: () => void
  onDragCard: (e: React.DragEvent) => void
  onRemove: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 520, damping: 34 }}
      // keep the text selection alive while the bar is used
      onMouseDown={(e) => e.preventDefault()}
      className="absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full border bg-popover/95 p-1.5 shadow-lg backdrop-blur"
    >
      {HIGHLIGHT_COLORS.map((c) => (
        <Tooltip key={c}>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={`Highlight ${c}`}
              onClick={() => onColor(c)}
              className={cn(
                'size-6 rounded-full border transition-transform hover:scale-110',
                activeColor === c && 'ring-2 ring-brand/70 ring-offset-1 ring-offset-popover'
              )}
              style={{ background: fillOf(c), borderColor: color(c).border }}
            />
          </TooltipTrigger>
          <TooltipContent className="capitalize">{c}</TooltipContent>
        </Tooltip>
      ))}
      <div className="mx-1 h-6 w-px bg-border" />
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" aria-label="Copy text" onClick={onCopy} className="grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground">
            <Copy size={16} />
          </button>
        </TooltipTrigger>
        <TooltipContent>Copy</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Create card"
            draggable
            onDragStart={onDragCard}
            onClick={onCreateCard}
            className="grid size-7 cursor-grab place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground active:cursor-grabbing"
          >
            <SquarePlus size={16} />
          </button>
        </TooltipTrigger>
        <TooltipContent>Create card — or drag onto the board</TooltipContent>
      </Tooltip>
      {canRemove && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" aria-label="Remove highlight" onClick={onRemove} className="grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-destructive">
              <Trash2 size={16} />
            </button>
          </TooltipTrigger>
          <TooltipContent>Remove highlight</TooltipContent>
        </Tooltip>
      )}
    </motion.div>
  )
}

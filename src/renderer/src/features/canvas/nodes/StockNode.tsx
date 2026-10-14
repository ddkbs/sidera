import type { NodeProps } from '@xyflow/react'
import { memo, useMemo } from 'react'
import { stockData, stockWidgetUrl } from '@shared/stocks'
import { cn } from '@/lib/utils'
import { useAppSelector } from '@/store'
import { t, useLang } from '@/lib/i18n'
import { useEditMode } from './useEditMode'
import type { ObjectNode } from '../types'
import { Handles, Resizer } from './NodeChrome'

/**
 * TradingView widget for one symbol. Like other nodes it is a normal board object (select, move, resize) until
 * double-clicked; only then does the iframe take pointer input. Clicking outside, Esc or moving the pointer off the
 * widget hands control back to the board — events inside the iframe never reach us, so leaving is the safe exit.
 */
export const StockNode = memo(function StockNode({ data, selected }: NodeProps<ObjectNode>) {
  const lang = useLang()
  const { editing, setEditing, root } = useEditMode(selected, () => {})
  const theme = useAppSelector((s) => s.ui.theme)
  const stock = stockData(data.object.data)
  const src = useMemo(() => stockWidgetUrl(stock, { theme, lang }), [stock.symbol, stock.variant, theme, lang]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <Resizer selected={selected} minWidth={260} minHeight={200} />
      <div
        ref={root}
        onMouseLeave={() => setEditing(false)}
        className={cn('relative h-full w-full overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow', selected && 'ring-2 ring-brand/70')}
      >
        <iframe
          key={src}
          src={src}
          title={stock.symbol}
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="origin"
          className={cn('h-full w-full border-0', editing ? 'nodrag nowheel' : 'pointer-events-none')}
        />
        {!editing && (
          <div
            className="group absolute inset-0"
            onDoubleClick={(e) => {
              e.stopPropagation()
              setEditing(true)
            }}
          >
            {selected && (
              <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-md bg-foreground/80 px-2 py-1 text-[11px] font-medium whitespace-nowrap text-background opacity-0 transition group-hover:opacity-100">
                {t('stock.interact')}
              </span>
            )}
          </div>
        )}
      </div>
      <Handles />
    </>
  )
})

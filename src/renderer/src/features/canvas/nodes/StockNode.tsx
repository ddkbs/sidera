import type { NodeProps } from '@xyflow/react'
import { memo, useMemo } from 'react'
import { stockData, stockWidgetUrl } from '@shared/stocks'
import { cn } from '@/lib/utils'
import { useAppSelector } from '@/store'
import { useLang } from '@/lib/i18n'
import type { ObjectNode } from '../types'
import { Handles, Resizer } from './NodeChrome'

/**
 * TradingView widget for one symbol. The iframe only takes pointer input while the node is selected — otherwise
 * clicks and drags reach the board (select, move), and the chart doesn't swallow canvas scroll/zoom.
 */
export const StockNode = memo(function StockNode({ data, selected }: NodeProps<ObjectNode>) {
  const lang = useLang()
  const theme = useAppSelector((s) => s.ui.theme)
  const stock = stockData(data.object.data)
  const src = useMemo(() => stockWidgetUrl(stock, { theme, lang }), [stock.symbol, stock.variant, theme, lang]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <Resizer selected={selected} minWidth={260} minHeight={200} />
      <div
        className={cn(
          'relative h-full w-full overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow',
          selected && 'ring-2 ring-brand/70'
        )}
      >
        <iframe
          key={src}
          src={src}
          title={stock.symbol}
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="origin"
          className={cn('h-full w-full border-0', selected ? 'nodrag nowheel' : 'pointer-events-none')}
        />
      </div>
      <Handles />
    </>
  )
})

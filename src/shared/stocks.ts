// Stock widgets on boards: object kind 'stock', data = StockData. Rendered as the official TradingView embed widget
// (iframe on tradingview-widget.com — the same page their embed script creates), so no script runs in our renderer.

export type StockVariant = 'overview' | 'chart'

export interface StockData {
  /** TradingView symbol, e.g. "NASDAQ:AAPL" (exchange prefix optional: "AAPL" lets TradingView pick) */
  symbol: string
  /** overview = price + area chart with date ranges (like the Notion embed); chart = full interactive candle chart */
  variant: StockVariant
}

export const STOCK_WIDGET_ORIGIN = 'https://www.tradingview-widget.com'

/** Upper-cased, trimmed symbol, or null when it isn't one (letters, digits and . _ - ! / & : only). */
export function normalizeSymbol(raw: string): string | null {
  const s = raw.trim().toUpperCase().replace(/\s+/g, '')
  if (!s || s.length > 40) return null
  return /^([A-Z0-9_.!-]+:)?[A-Z0-9_.!/&-]+$/.test(s) ? s : null
}

/** Symbol from a tradingview.com URL (/symbols/NASDAQ-AAPL/, /chart/?symbol=NASDAQ:AAPL), else null. */
export function symbolFromTradingViewUrl(url: string): string | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (!/(^|\.)tradingview\.com$/i.test(u.hostname)) return null
  const q = u.searchParams.get('symbol') ?? u.searchParams.get('tvwidgetsymbol')
  if (q) return normalizeSymbol(decodeURIComponent(q))
  const m = u.pathname.match(/^\/symbols\/([^/]+)/i)
  if (!m) return null
  const part = decodeURIComponent(m[1])
  // /symbols/NASDAQ-AAPL/ → NASDAQ:AAPL (first dash separates the exchange; no dash = bare ticker)
  const i = part.indexOf('-')
  return normalizeSymbol(i > 0 ? `${part.slice(0, i)}:${part.slice(i + 1)}` : part)
}

/** Read stored object data defensively. */
export function stockData(data: Record<string, unknown>): StockData {
  return {
    symbol: typeof data.symbol === 'string' && data.symbol ? data.symbol : 'NASDAQ:AAPL',
    variant: data.variant === 'chart' ? 'chart' : 'overview'
  }
}

/** iframe src for the widget. */
export function stockWidgetUrl(d: StockData, opts: { theme: 'light' | 'dark'; lang: string }): string {
  const locale = opts.lang === 'de' ? 'de_DE' : 'en'
  const dark = opts.theme === 'dark'
  const common = { autosize: true, width: '100%', height: '100%', colorTheme: opts.theme, isTransparent: true, locale }
  const settings =
    d.variant === 'chart'
      ? { ...common, symbol: d.symbol, interval: 'D', timezone: 'Etc/UTC', theme: opts.theme, style: '1', allow_symbol_change: true, hide_side_toolbar: true, calendar: false, support_host: 'https://www.tradingview.com' }
      : {
          ...common,
          symbols: [[d.symbol, `${d.symbol}|1D`]],
          chartOnly: false,
          showVolume: false,
          showMA: false,
          hideDateRanges: false,
          hideMarketStatus: false,
          hideSymbolLogo: false,
          scalePosition: 'right',
          scaleMode: 'Normal',
          fontSize: '10',
          noTimeScale: false,
          valuesTracking: '1',
          changeMode: 'price-and-percent',
          chartType: 'area',
          headerFontSize: 'medium',
          lineWidth: 2,
          lineType: 0,
          dateRanges: ['1d|1', '1m|30', '3m|60', '12m|1D', '60m|1W', 'all|1M'],
          upColor: '#22ab94',
          downColor: '#f7525f',
          gridLineColor: dark ? 'rgba(242, 242, 242, 0.06)' : 'rgba(46, 46, 46, 0.06)'
        }
  const widget = d.variant === 'chart' ? 'advanced-chart' : 'symbol-overview'
  return `${STOCK_WIDGET_ORIGIN}/embed-widget/${widget}/?locale=${locale}#${encodeURIComponent(JSON.stringify(settings))}`
}

import { describe, expect, it } from 'vitest'
import { normalizeSymbol, stockData, stockWidgetUrl, symbolFromTradingViewUrl } from '../src/shared/stocks'

describe('stock widgets', () => {
  it('normalizes symbols', () => {
    expect(normalizeSymbol(' nasdaq:nbis ')).toBe('NASDAQ:NBIS')
    expect(normalizeSymbol('BRK.B')).toBe('BRK.B')
    expect(normalizeSymbol('')).toBeNull()
    expect(normalizeSymbol('a"b')).toBeNull()
    expect(normalizeSymbol('x:y:z')).toBeNull()
  })

  it('reads symbols from TradingView links', () => {
    expect(symbolFromTradingViewUrl('https://www.tradingview.com/symbols/NASDAQ-AAPL/')).toBe('NASDAQ:AAPL')
    expect(symbolFromTradingViewUrl('https://de.tradingview.com/symbols/XETR-SAP/?exchange=XETR')).toBe('XETR:SAP')
    expect(symbolFromTradingViewUrl('https://www.tradingview.com/chart/?symbol=BINANCE%3ABTCUSDT')).toBe('BINANCE:BTCUSDT')
    expect(symbolFromTradingViewUrl('https://www.tradingview.com/symbols/SPX/')).toBe('SPX')
    expect(symbolFromTradingViewUrl('https://example.com/symbols/NASDAQ-AAPL/')).toBeNull()
    expect(symbolFromTradingViewUrl('https://www.tradingview.com/markets/')).toBeNull()
  })

  it('builds the widget URL with the symbol in the hash', () => {
    const url = stockWidgetUrl(stockData({ symbol: 'NASDAQ:AAPL' }), { theme: 'dark', lang: 'de' })
    expect(url.startsWith('https://www.tradingview-widget.com/embed-widget/symbol-overview/?locale=de_DE#')).toBe(true)
    const settings = JSON.parse(decodeURIComponent(url.split('#')[1]))
    expect(settings).toMatchObject({ symbols: [['NASDAQ:AAPL', 'NASDAQ:AAPL|1D']], colorTheme: 'dark' })
    expect(stockWidgetUrl(stockData({ symbol: 'X', variant: 'chart' }), { theme: 'light', lang: 'en' })).toContain('/advanced-chart/?locale=en#')
  })
})

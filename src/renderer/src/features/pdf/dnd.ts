/** Payload dragged out of the PDF reader onto a whiteboard (or onto a card on it). */
export interface HighlightDrag {
  fileId: string
  fileName: string
  page: number
  color: string
  text: string
  /** set once the highlight is persisted — lets the drop target link back to it */
  highlightId?: string
}

export const HIGHLIGHT_MIME = 'application/x-sidera-highlight'

/** Fired by the reader's "create card" action; a mounted whiteboard handles it and calls preventDefault(). */
export const HIGHLIGHT_CARD_EVENT = 'sidera:highlight-card'

export function setHighlightDrag(dt: DataTransfer, payload: HighlightDrag): void {
  dt.effectAllowed = 'copy'
  dt.setData(HIGHLIGHT_MIME, JSON.stringify(payload))
  // so the quote can also be dropped into a plain text field
  dt.setData('text/plain', payload.text)
}

export function readHighlightDrag(dt: DataTransfer): HighlightDrag | null {
  const raw = dt.getData(HIGHLIGHT_MIME)
  if (!raw) return null
  try {
    const p = JSON.parse(raw) as HighlightDrag
    return p && typeof p.text === 'string' && typeof p.fileId === 'string' ? p : null
  } catch {
    return null
  }
}

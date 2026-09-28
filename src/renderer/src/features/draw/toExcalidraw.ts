import { convertToExcalidrawElements, exportToSvg, restoreElements } from '@excalidraw/excalidraw'
import type { DrawSubmission } from '@shared/drawProtocol'
import { drawingToSkeletons } from './sketch'

export type SketchPreviews = {
  svg: string
  /** only when the sketch contains images: see `renderSketchPreviews` */
  svgDark?: string
}

/**
 * Static previews of a sketch for the whiteboard node. Ink-only sketches keep one light SVG that the node inverts with
 * CSS in dark mode (as before). A sketch with images also gets a dark SVG rendered by Excalidraw's own dark export,
 * which inverts the ink but re-inverts bitmap images, so photos keep their real colours; the node then shows that one
 * without any CSS filter.
 */
export async function renderSketchPreviews(elements: readonly unknown[], files: Record<string, unknown>): Promise<SketchPreviews> {
  const render = async (dark: boolean): Promise<string> =>
    (await exportToSvg({ elements: elements as never, files: files as never, appState: { exportBackground: false, exportWithDarkMode: dark }, exportPadding: 16 }))
      .outerHTML
  const hasImages = elements.some((el) => (el as { type?: string; isDeleted?: boolean }).type === 'image' && !(el as { isDeleted?: boolean }).isDeleted)
  return hasImages ? { svg: await render(false), svgDark: await render(true) } : { svg: await render(false) }
}

/**
 * Builds the data of a `sketch` whiteboard object from an iPad drawing — the same `{elements, files, svg}` shape
 * SketchEditor saves, so double-clicking it opens Excalidraw with every stroke and image as its own element.
 * Loaded lazily (Excalidraw is a large bundle).
 */
export async function buildSketchData(drawing: DrawSubmission): Promise<{ elements: unknown[]; files: Record<string, unknown> } & SketchPreviews> {
  const { skeletons, files } = drawingToSkeletons(drawing)
  // lines/images go through Excalidraw's element factory; freedraw skeletons pass through and restoreElements fills the rest
  const converted = convertToExcalidrawElements(skeletons as never, { regenerateIds: true })
  const byId = new Map(skeletons.map((s, i) => [converted[i]?.id, s]))
  const restored = restoreElements(converted, null).map((el) => {
    const s = byId.get(el.id)
    // restoreElements drops lastCommittedPoint; keep it so freedraw ends are rendered finished (like Excalidraw's own)
    return s?.type === 'freedraw' && el.type === 'freedraw' ? { ...el, lastCommittedPoint: s.lastCommittedPoint } : el
  })
  return { elements: restored, files, ...(await renderSketchPreviews(restored, files)) }
}

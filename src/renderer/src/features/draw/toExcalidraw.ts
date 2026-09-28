import { convertToExcalidrawElements, exportToSvg, restoreElements } from '@excalidraw/excalidraw'
import type { DrawSubmission } from '@shared/drawProtocol'
import { strokesToSkeletons } from './sketch'

/**
 * Builds the data of a `sketch` whiteboard object from an iPad drawing — the same `{elements, files, svg}` shape
 * SketchEditor saves, so double-clicking it opens Excalidraw with every stroke as its own element.
 * Loaded lazily (Excalidraw is a large bundle).
 */
export async function buildSketchData(drawing: DrawSubmission): Promise<{ elements: unknown[]; files: Record<string, unknown>; svg: string }> {
  const skeletons = strokesToSkeletons(drawing)
  // lines go through Excalidraw's element factory; freedraw skeletons pass through and restoreElements fills the rest
  const converted = convertToExcalidrawElements(skeletons as never, { regenerateIds: true })
  const byId = new Map(skeletons.map((s, i) => [converted[i]?.id, s]))
  const restored = restoreElements(converted, null).map((el) => {
    const s = byId.get(el.id)
    // restoreElements drops lastCommittedPoint; keep it so freedraw ends are rendered finished (like Excalidraw's own)
    return s?.type === 'freedraw' && el.type === 'freedraw' ? { ...el, lastCommittedPoint: s.lastCommittedPoint } : el
  })
  const svg = await exportToSvg({ elements: restored as never, files: {}, appState: { exportBackground: false, exportWithDarkMode: false }, exportPadding: 16 })
  return { elements: restored, files: {}, svg: svg.outerHTML }
}

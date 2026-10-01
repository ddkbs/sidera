import { exportToSvg } from '@excalidraw/excalidraw'

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

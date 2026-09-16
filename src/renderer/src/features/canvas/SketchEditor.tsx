import { Excalidraw, exportToSvg } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { useAppSelector } from '@/store'

type Api = Parameters<NonNullable<React.ComponentProps<typeof Excalidraw>['excalidrawAPI']>>[0]

interface Props {
  initial: { elements?: unknown[]; files?: Record<string, unknown> }
  onSave: (data: { elements: unknown[]; files: Record<string, unknown>; svg: string }) => void
  onClose: () => void
}

/** Full-screen Excalidraw editor for a sketch object. Loaded lazily (large bundle). */
export default function SketchEditor({ initial, onSave, onClose }: Props) {
  const theme = useAppSelector((s) => s.ui.theme)
  const [api, setApi] = useState<Api | null>(null)

  const save = async () => {
    if (!api) return onClose()
    const elements = api.getSceneElements()
    const files = api.getFiles()
    const svg = await exportToSvg({ elements, files, appState: { exportBackground: false, exportWithDarkMode: false }, exportPadding: 16 })
    onSave({ elements: [...elements], files: files as Record<string, unknown>, svg: svg.outerHTML })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && void save()}>
      <DialogContent showCloseButton={false} className="flex h-[92vh] max-w-[96vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-[96vw]">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <DialogTitle className="text-sm">Sketch</DialogTitle>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={onClose}>
            Discard
          </Button>
          <Button size="sm" onClick={() => void save()}>
            Done
          </Button>
        </div>
        <div className="min-h-0 flex-1">
          <Excalidraw
            excalidrawAPI={setApi}
            theme={theme}
            initialData={{
              elements: (initial.elements ?? []) as never,
              files: (initial.files ?? {}) as never,
              appState: { viewBackgroundColor: 'transparent' }
            }}
            UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false, export: false, saveAsImage: false } }}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}

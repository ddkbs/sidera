import { Plus, Trash2 } from '@/components/icons'
import { nanoid } from 'nanoid'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useGetWhiteboardQuery, useUpdateWhiteboardPropertiesMutation } from '@/store/api'
import type { WhiteboardProperty } from '@shared/types'

/** Suggested keys shown as quick-add chips when they aren't already in use. */
const SUGGESTED_KEYS = ['Autor', 'Published on', 'Datum', 'Topic']

interface Props {
  whiteboardId: string | null
  onClose: () => void
}

/**
 * Simple free-form key/value metadata editor for a whiteboard (not the typed
 * Tag/Card property system). Opened from the sidebar board menu and from the
 * canvas background context menu for the currently open whiteboard.
 */
export function WhiteboardPropertiesDialog({ whiteboardId, onClose }: Props) {
  const { data: detail } = useGetWhiteboardQuery(whiteboardId ?? '', { skip: !whiteboardId })
  const [update] = useUpdateWhiteboardPropertiesMutation()
  const [rows, setRows] = useState<WhiteboardProperty[]>([])

  useEffect(() => {
    if (detail) setRows(detail.whiteboard.properties)
  }, [detail])

  const save = (next: WhiteboardProperty[]) => {
    setRows(next)
    if (whiteboardId) void update({ whiteboardId, properties: next })
  }

  const addRow = (key = '') => save([...rows, { id: nanoid(), key, value: '' }])
  const removeRow = (id: string) => save(rows.filter((r) => r.id !== id))
  const patchRow = (id: string, patch: Partial<Pick<WhiteboardProperty, 'key' | 'value'>>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  const commit = () => save(rows)

  const usedKeys = new Set(rows.map((r) => r.key.trim().toLowerCase()))
  const availableSuggestions = SUGGESTED_KEYS.filter((k) => !usedKeys.has(k.toLowerCase()))

  return (
    <Dialog open={whiteboardId !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Properties</DialogTitle>
          <DialogDescription>Free-form key/value metadata for this whiteboard.</DialogDescription>
        </DialogHeader>

        <div className="mt-2 flex flex-col gap-2">
          {rows.map((row) => (
            <div key={row.id} className="flex items-center gap-2">
              <Input
                placeholder="Key"
                className="w-2/5"
                value={row.key}
                onChange={(e) => patchRow(row.id, { key: e.target.value })}
                onBlur={commit}
              />
              <Input
                placeholder="Value"
                className="flex-1"
                value={row.value}
                onChange={(e) => patchRow(row.id, { value: e.target.value })}
                onBlur={commit}
              />
              <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground" onClick={() => removeRow(row.id)}>
                <Trash2 />
              </Button>
            </div>
          ))}
          {rows.length === 0 && <p className="text-sm text-muted-foreground">No properties yet.</p>}
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => addRow()}>
            <Plus /> Add property
          </Button>
          {availableSuggestions.map((key) => (
            <Button key={key} variant="ghost" size="sm" className="text-muted-foreground" onClick={() => addRow(key)}>
              + {key}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

import { CircleDot } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { color } from '@/lib/colors'
import { useSetPropertyValueMutation } from '@/store/api'
import type { CardDetail } from '@shared/types'

const NONE = '__none'

export function PropertyList({ cardId, properties }: { cardId: string; properties: CardDetail['properties'] }) {
  const [setValue] = useSetPropertyValueMutation()
  return (
    <div className="mb-5 grid grid-cols-[120px_1fr] items-center gap-x-3 gap-y-1 text-sm">
      {properties.map(({ property, value }) => (
        <div key={property.id} className="contents">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <CircleDot className="size-3.5" />
            {property.name}
          </div>
          {property.type === 'select' ? (
            <Select
              value={typeof value === 'string' ? value : NONE}
              onValueChange={(v) => setValue({ cardId, propertyId: property.id, value: v === NONE ? null : v })}
            >
              <SelectTrigger size="sm" className="h-7 w-fit border-none shadow-none hover:bg-accent">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>
                  <span className="text-muted-foreground">Empty</span>
                </SelectItem>
                {property.options.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    <span className="rounded px-1.5 py-0.5 text-xs font-medium" style={{ background: color(o.color).bg, color: color(o.color).fg }}>
                      {o.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <input
              defaultValue={value == null ? '' : String(value)}
              onBlur={(e) => setValue({ cardId, propertyId: property.id, value: e.target.value })}
              className="h-7 rounded-md bg-transparent px-2 outline-none hover:bg-accent focus:bg-accent"
              placeholder="Empty"
            />
          )}
        </div>
      ))}
    </div>
  )
}

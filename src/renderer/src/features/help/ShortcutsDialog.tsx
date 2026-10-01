import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Kbd } from '@/components/ui/kbd'
import { t, type MessageKey } from '@/lib/i18n'
import { COMMANDS, commandGroupLabel, commandLabel, formatBinding, useBindings, useCommands } from '@/lib/shortcuts'
import { useAppDispatch, useAppSelector } from '@/store'
import { openSettings, setShortcutsOpen } from '@/store/ui'

const FIXED: [string | MessageKey, MessageKey][] = [
  ['/', 'help.fixed.slash'],
  ['@', 'help.fixed.mention'],
  ['help.key.doubleClick', 'help.fixed.doubleClick'],
  ['help.key.cmdClick', 'help.fixed.cmdClick'],
  ['⌫', 'help.fixed.remove']
]

export function ShortcutsDialog() {
  const dispatch = useAppDispatch()
  const open = useAppSelector((s) => s.ui.shortcutsOpen)
  const setOpen = (o: boolean) => dispatch(setShortcutsOpen(o))
  const bindings = useBindings()
  useCommands({ 'shortcuts.open': () => setOpen(!open) })
  const groups = [...new Set(COMMANDS.map((c) => c.group))]

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[86vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader className="flex-row items-center justify-between">
          <DialogTitle>{t('cmd.shortcuts.open')}</DialogTitle>
          <Button
            variant="outline"
            size="sm"
            className="mr-6"
            onClick={() => {
              setOpen(false)
              dispatch(openSettings('shortcuts'))
            }}
          >
            {t('help.customize')}
          </Button>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-x-10 gap-y-6">
          {groups.map((g) => (
            <section key={g}>
              <h3 className="mb-2 text-xs font-medium text-muted-foreground">{commandGroupLabel(g)}</h3>
              <div className="space-y-1.5">
                {COMMANDS.filter((c) => c.group === g && bindings[c.id]).map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-3 text-sm">
                    <span>{commandLabel(c)}</span>
                    <Kbd>{formatBinding(bindings[c.id])}</Kbd>
                  </div>
                ))}
              </div>
            </section>
          ))}
          <section>
            <h3 className="mb-2 text-xs font-medium text-muted-foreground">{t('help.mouseEditor')}</h3>
            <div className="space-y-1.5">
              {FIXED.map(([k, label]) => (
                <div key={label} className="flex items-center justify-between gap-3 text-sm">
                  <span>{t(label)}</span>
                  <Kbd>{k.startsWith('help.') ? t(k as MessageKey) : k}</Kbd>
                </div>
              ))}
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}

import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAppDispatch, useAppSelector } from '@/store'
import { useGetMcpInfoQuery } from '@/store/api'
import { setMcpDialogOpen } from '@/store/ui'

const TOOLS = [
  'search_cards', 'get_card', 'create_card', 'update_card', 'list_tags', 'tag_card', 'list_whiteboards', 'get_whiteboard',
  'create_whiteboard', 'add_card_to_whiteboard', 'add_section', 'connect_objects', 'get_kanban', 'move_kanban_item', 'get_journal', 'append_to_journal'
]

export function McpDialog() {
  const dispatch = useAppDispatch()
  const open = useAppSelector((s) => s.ui.mcpDialogOpen)
  const { data } = useGetMcpInfoQuery()
  const activity = useAppSelector((s) => s.ui.activity)
  const url = data?.url ?? 'http://127.0.0.1:3845/mcp'
  const claudeCode = `claude mcp add --transport http canvascl ${url}`
  const desktop = JSON.stringify({ mcpServers: { canvascl: { command: data?.stdioCommand.split('" ')[0].replace(/^"/, '') ?? 'CanvasCL', args: ['--mcp-stdio'] } } }, null, 2)

  return (
    <Dialog open={open} onOpenChange={(o) => dispatch(setMcpDialogOpen(o))}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Connect an AI agent</DialogTitle>
          <DialogDescription>
            CanvasCL runs a local MCP server so assistants can search, write and organize your cards. Everything stays on this Mac.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
          <span className={`size-2 rounded-full ${data?.running ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
          {data?.running ? <>Listening on <code className="font-mono text-xs">{url}</code></> : 'HTTP server not running (port busy?) — stdio mode still works.'}
        </div>
        <Tabs defaultValue="code">
          <TabsList>
            <TabsTrigger value="code">Claude Code</TabsTrigger>
            <TabsTrigger value="desktop">Claude Desktop (stdio)</TabsTrigger>
          </TabsList>
          <TabsContent value="code"><Snippet text={claudeCode} /></TabsContent>
          <TabsContent value="desktop"><Snippet text={desktop} /></TabsContent>
        </Tabs>
        {activity.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Recent agent activity</p>
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {activity.map((a, i) => (
                <div key={a.at + ':' + i} className="flex items-baseline gap-2 text-xs">
                  <span className="shrink-0 text-muted-foreground tabular-nums">{new Date(a.at).toLocaleTimeString()}</span>
                  <code className="shrink-0 font-mono font-medium">{a.tool}</code>
                  <span className="truncate font-mono text-muted-foreground">{a.args}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">{TOOLS.length} tools</p>
          <div className="flex flex-wrap gap-1">
            {TOOLS.map((t) => (
              <code key={t} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">{t}</code>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Snippet({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="group relative">
      <pre className="overflow-x-auto rounded-lg bg-muted p-3 pr-10 font-mono text-xs">{text}</pre>
      <button
        className="absolute top-2 right-2 grid size-7 place-items-center rounded-md bg-background/80 text-muted-foreground transition hover:text-foreground"
        onClick={() => {
          void navigator.clipboard.writeText(text)
          setCopied(true)
          toast.success('Copied')
          setTimeout(() => setCopied(false), 1500)
        }}
        aria-label="Copy"
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  )
}

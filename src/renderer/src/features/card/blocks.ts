import { Extension, InputRule } from '@tiptap/core'

/**
 * Notion-style input rules for the blocks StarterKit does not cover.
 * `||| ` (one pipe per extra column) starts a table, `>> ` starts a toggle.
 */
export const BlockInputRules = Extension.create({
  name: 'sideraBlockInputRules',
  addInputRules() {
    return [
      new InputRule({
        find: /^\|(\|+)\s$/,
        handler: ({ range, match, chain }) => {
          chain().deleteRange(range).insertTable({ rows: 3, cols: match[1].length + 1, withHeaderRow: true }).run()
        }
      }),
      new InputRule({
        find: /^>>\s$/,
        handler: ({ range, chain }) => {
          chain().deleteRange(range).setDetails().run()
        }
      })
    ]
  }
})

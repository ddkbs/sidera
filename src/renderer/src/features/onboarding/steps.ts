import type { MessageKey } from '@/lib/i18n'
import type { Side } from './geometry'

/** Texts are dictionary keys (`{app}` = app name), translated when shown. */
export interface TourStep {
  id: string
  title: MessageKey
  body: MessageKey
  /** shown instead of `body` when the target can't be found (e.g. no whiteboard exists yet) */
  fallbackBody?: MessageKey
  /** matches the element's `data-tour` attribute; omit for a centered step */
  target?: string
  /** preferred side for the popover (falls back to whatever fits) */
  placement?: Side
  /** extra space around the target in the cutout */
  padding?: number
  /** what the UI needs before the target can exist */
  needs?: 'sidebar' | 'whiteboard'
  /** command ids from lib/shortcuts.ts whose (user-customisable) bindings are shown as key hints */
  shortcuts?: string[]
  /** literal key hints shown after the shortcuts (e.g. a canvas tool letter) */
  keys?: { label: string; keys: string }[]
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'home',
    title: 'tour.home.title',
    body: 'tour.home.body',
    target: 'nav-home',
    needs: 'sidebar',
    padding: 4
  },
  {
    id: 'write',
    title: 'tour.write.title',
    body: 'tour.write.body',
    fallbackBody: 'tour.write.fallback',
    target: 'tool-text',
    placement: 'right',
    needs: 'whiteboard',
    shortcuts: ['tool.text', 'canvas.newTextBlock']
  },
  {
    id: 'pen',
    title: 'tour.pen.title',
    body: 'tour.pen.body',
    fallbackBody: 'tour.pen.fallback',
    target: 'tool-pen',
    placement: 'right',
    needs: 'whiteboard',
    shortcuts: ['tool.pen']
  },
  {
    id: 'insert',
    title: 'tour.insert.title',
    body: 'tour.insert.body',
    target: 'canvas-insert',
    placement: 'right',
    needs: 'whiteboard'
  },
  {
    id: 'ipad',
    title: 'tour.ipad.title',
    body: 'tour.ipad.body',
    target: 'canvas-insert',
    placement: 'right',
    needs: 'whiteboard',
    shortcuts: ['canvas.drawOnIpad']
  },
  {
    id: 'search',
    title: 'tour.search.title',
    body: 'tour.search.body',
    target: 'sidebar-search',
    needs: 'sidebar',
    shortcuts: ['palette.open']
  },
  {
    id: 'ai',
    title: 'tour.ai.title',
    body: 'tour.ai.body',
    target: 'ask-ai',
    needs: 'sidebar',
    shortcuts: ['chat.toggle', 'settings.open']
  },
  {
    id: 'more',
    title: 'tour.more.title',
    body: 'tour.more.body',
    target: 'nav-library',
    needs: 'sidebar'
  },
  {
    id: 'done',
    title: 'tour.done.title',
    body: 'tour.done.body',
    shortcuts: ['shortcuts.open']
  }
]

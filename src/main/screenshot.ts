import { execFile } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** macOS interactive region screenshot (crosshair, Space toggles window mode) → PNG path, or null when cancelled with Esc. */
export function captureScreenRegion(): Promise<string | null> {
  const path = join(tmpdir(), `sidera-shot-${Date.now()}.png`)
  return new Promise((resolve) => {
    execFile('/usr/sbin/screencapture', ['-i', '-x', path], () => resolve(existsSync(path) && statSync(path).size > 0 ? path : null))
  })
}

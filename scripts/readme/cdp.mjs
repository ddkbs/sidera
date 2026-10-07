/**
 * Tiny Chrome DevTools Protocol driver for the README's iPad screenshots: launches the locally installed Google
 * Chrome headless, emulates an iPad (viewport, touch, user agent) and captures PNGs. No npm dependency — Node's
 * global WebSocket speaks CDP directly.
 */
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'

const CHROME = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const IPAD_UA = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function launchIpadChrome({ profileDir, width = 1180, height = 820, scale = 2, port = 9333, dark = false }) {
  mkdirSync(profileDir, { recursive: true })
  const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`, '--no-first-run', '--hide-scrollbars', '--lang=en-US', `--window-size=${width},${height}`, 'about:blank'], { stdio: 'ignore' })
  let target
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200)
    target = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json()).then((l) => l.find((t) => t.type === 'page')).catch(() => null)
  }
  if (!target) throw new Error('Chrome did not start')
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((r, j) => ((ws.onopen = r), (ws.onerror = j)))
  let id = 0
  const pending = new Map()
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data)
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id)
      pending.delete(msg.id)
      msg.error ? rej(new Error(msg.error.message)) : res(msg.result)
    }
  }
  const send = (method, params = {}) => new Promise((res, rej) => (pending.set(++id, { res, rej }), ws.send(JSON.stringify({ id, method, params }))))
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false })
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  await send('Network.setUserAgentOverride', { userAgent: IPAD_UA, platform: 'iPad', acceptLanguage: 'en-US' })
  await send('Emulation.setLocaleOverride', { locale: 'en-US' })
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }, { name: 'display-mode', value: 'standalone' }] }).catch(() =>
    send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }] })
  )
  return {
    send,
    async goto(url, wait = 2500) {
      await send('Page.navigate', { url })
      await sleep(wait)
    },
    async eval(expression) {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
      return r.result?.value
    },
    async shot() {
      const r = await send('Page.captureScreenshot', { format: 'png' })
      return Buffer.from(r.data, 'base64')
    },
    close() {
      ws.close()
      proc.kill()
    }
  }
}

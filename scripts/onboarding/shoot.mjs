#!/usr/bin/env node
/**
 * Regenerates the welcome-slide screenshots in src/renderer/src/assets/onboarding/.
 *
 *   node scripts/onboarding/shoot.mjs            # light + dark
 *   node scripts/onboarding/shoot.mjs dark       # one theme only
 *
 * For every theme it starts the dev app via the devShot hook (see CLAUDE.md) against a throw-away data
 * dir, seeds a demo workspace (scripts/onboarding/seed.js — the fictional "Nimbus Aerospace" board), captures
 * each view and converts the captures to WebP with `cwebp` (brew install webp). Also refreshes the small app
 * icon used on the welcome screen. Never touches your real data dir.
 * Env: SIDERA_MCP_PORT (default 3852), ONBOARDING_SHOTS_DIR (scratch).
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const outDir = join(root, 'src/renderer/src/assets/onboarding')
const scratch = process.env.ONBOARDING_SHOTS_DIR ?? join(tmpdir(), 'sidera-onboarding-shots')
const themes = process.argv.slice(2).length ? process.argv.slice(2) : ['light', 'dark']
const seed = readFileSync(join(root, 'scripts/onboarding/seed.js'), 'utf8')

/** App is rendered with CSS zoom so the UI reads larger inside the slide frame (1440×900 window → 1152×720 layout). */
const ZOOM = 1.25
/** Output width of every WebP (the source capture is 2× the 1440×900 window). */
const WIDTH = 1600

export const board = `(await window.api.listWhiteboards()).find((b) => b.name.includes('Nimbus'))`
/** Opens the Nimbus board at a given viewport (layout px of the zoomed app), optionally with the chat panel. */
export const openBoard = (viewport, chat = false) => `(async () => {
  const b = ${board}
  await window.api.updateWhiteboard({ id: b.id, viewport: ${JSON.stringify(viewport)} })
  localStorage['sidera.ui'] = JSON.stringify({ sidebarOpen: true, chatOpen: ${chat}, tabs: [{ id: 't1', view: { type: 'whiteboard', id: b.id } }], activeTabId: 't1' })
  setTimeout(() => location.reload(), 50)
})()`
const zoomStep = `document.documentElement.style.zoom = '${ZOOM}'; window.dispatchEvent(new Event('resize')); new Promise((r) => setTimeout(() => r(1), 900))`

export const chatExchange = `window.__devChatMessage?.('Summarize Nimbus Aerospace for me — how is the business doing?', {
  tools: ['get_whiteboard'],
  text: "**Nimbus Aerospace** builds reusable small-satellite launchers in Bremen (founded 2016, ~420 people).\\n\\n- Revenue grew from **€4m to €83m** between 2021 and 2025 — **+73%** last year\\n- First orbit in 2022, first booster landing in 2024\\n- €310m raised in total, most recently a €180m Series C\\n\\nWant me to add a table of upcoming launches and link a chart to it?"
})`

/** Each shot: steps that lead to it (the last step's PNG is the one kept). */
const shots = [
  { name: 'board', steps: [openBoard({ x: 96, y: 124, zoom: 0.5 }), zoomStep, '@click 864 720'] },
  { name: 'charts', steps: [openBoard({ x: -236, y: -84, zoom: 0.9 }), zoomStep, '@click 792 800'] },
  {
    name: 'draw',
    steps: [openBoard({ x: -470, y: -100, zoom: 0.85 }), zoomStep, '@click 1080 792', '@click [aria-label="Pen"]', 'new Promise((r) => setTimeout(() => r(1), 400))']
  },
  { name: 'ai', steps: [openBoard({ x: 90, y: 96, zoom: 0.36 }, true), zoomStep, '@click 600 760', `${chatExchange}; new Promise((r) => setTimeout(() => r(1), 600))`] }
]

function run(theme) {
  const dir = join(scratch, theme)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const settings = `(async () => { await window.app.setSettings({ theme: '${theme}', canvas: { showMinimap: false }, onboarding: { welcomeSeen: true } }); return 1 })()`
  const steps = [seed, settings]
  const keep = []
  for (const s of shots) {
    steps.push(...s.steps)
    keep.push({ name: s.name, index: steps.length - 1 })
  }
  writeFileSync(join(dir, 'steps.js'), steps.join('\n---\n'))
  console.log(`[${theme}] capturing ${shots.length} views…`)
  const res = spawnSync('npx', ['electron-vite', 'dev'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    env: {
      ...process.env,
      SIDERA_MCP_PORT: process.env.SIDERA_MCP_PORT ?? '3852',
      SIDERA_DATA_DIR: join(dir, 'data'),
      SIDERA_SHOT: join(dir, 's.png'),
      SIDERA_SCRIPT: join(dir, 'steps.js'),
      SIDERA_QUIT: '1'
    },
    timeout: 300_000
  })
  for (const line of `${res.stdout}\n${res.stderr}`.split('\n')) if (/\[shot\]/.test(line)) console.log('  ', line.trim().slice(0, 160))
  mkdirSync(outDir, { recursive: true })
  for (const k of keep) {
    const src = join(dir, `s-${k.index}.png`)
    if (!existsSync(src)) throw new Error(`missing capture ${src}`)
    const out = join(outDir, `${k.name}-${theme}.webp`)
    execFileSync('cwebp', ['-quiet', '-q', '80', '-m', '6', '-resize', String(WIDTH), '0', src, '-o', out])
    console.log(`  → ${out.replace(root + '/', '')} (${Math.round(statSync(out).size / 1024)} KB)`)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const t of themes) run(t)
  execFileSync('sips', ['-Z', '128', join(root, 'build/icon.png'), '--out', join(outDir, 'app-icon.png')], { stdio: 'ignore' })
  console.log('done')
}

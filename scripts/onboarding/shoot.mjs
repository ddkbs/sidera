#!/usr/bin/env node
/**
 * Regenerates the welcome-slide screenshots in src/renderer/src/assets/onboarding/.
 *
 *   node scripts/onboarding/shoot.mjs            # light + dark
 *   node scripts/onboarding/shoot.mjs dark       # one theme only
 *
 * For every theme it starts the dev app via the devShot hook (see CLAUDE.md) against a throw-away data
 * dir, seeds a demo workspace (scripts/onboarding/seed.js), captures each view and converts the crops to
 * WebP with `cwebp` (brew install webp). Also refreshes the small app icon used on the welcome screen.
 * Never touches your real data dir. Env: CANVASCL_MCP_PORT (default 3852), ONBOARDING_SHOTS_DIR (scratch).
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const outDir = join(root, 'src/renderer/src/assets/onboarding')
const scratch = process.env.ONBOARDING_SHOTS_DIR ?? join(tmpdir(), 'canvascl-onboarding-shots')
const themes = process.argv.slice(2).length ? process.argv.slice(2) : ['light', 'dark']
const seed = readFileSync(join(root, 'scripts/onboarding/seed.js'), 'utf8')

/** App is rendered with CSS zoom so the UI reads larger inside the slide frame (1440×900 window → 1152×720 layout). */
const ZOOM = 1.25
/** Output width of every WebP (the source capture is 2× the 1440×900 window). */
const WIDTH = 1600

const ui = (view, extra = '') => `(async () => {
  ${extra}
  localStorage['canvascl.ui'] = JSON.stringify({ sidebarOpen: true, chatOpen: ${view.chat ? 'true' : 'false'}, tabs: [{ id: 't1', view: ${view.expr} }], activeTabId: 't1' })
  setTimeout(() => location.reload(), 50)
})()`
const zoomStep = `document.documentElement.style.zoom = '${ZOOM}'; window.dispatchEvent(new Event('resize')); 1`
/** park the pointer on empty space so no hover state (connection handles, row highlight) ends up in a shot */
const park = '@click 700 860'
const board = `(await window.api.listWhiteboards()).find((b) => b.name.startsWith('Atlas'))`
const tag = (name) => `(await window.api.listTags()).find((t) => t.name === ${JSON.stringify(name)})`

/** Each shot: steps that lead to it (the last step's PNG is the one kept) + crop in window CSS px. */
const shots = [
  {
    name: 'whiteboard',
    steps: [
      ui(
        { expr: `{ type: 'whiteboard', id: b.id }` },
        `const b = ${board}; await window.api.updateWhiteboard({ id: b.id, viewport: { x: 120, y: 150, zoom: 0.64 } })`
      ),
      zoomStep
    ]
  },
  { name: 'library', steps: [ui({ expr: `{ type: 'library', tagId: t.id, mode: 'table' }` }, `const t = ${tag('Atlas v2')}`), zoomStep] },
  { name: 'kanban', steps: [ui({ expr: `{ type: 'library', tagId: t.id, mode: 'kanban' }` }, `const t = ${tag('Atlas v2')}`), zoomStep] },
  {
    name: 'ai',
    steps: [
      ui(
        { expr: `{ type: 'whiteboard', id: b.id }`, chat: true },
        `const b = ${board}; await window.api.updateWhiteboard({ id: b.id, viewport: { x: 100, y: 150, zoom: 0.5 } })`
      ),
      zoomStep +
        `; setTimeout(() => window.__devChatMessage?.('Link my research to the launch goals and add a card with open questions', {
          tools: ['search_cards', 'connect_objects', 'create_card', 'add_card_to_whiteboard'],
          text: "Done — I connected **Interview synthesis** and **Pricing survey** to *Launch goals* and added an **Open questions** card next to them:\\n\\n- Which tier do teams expect for 5+ seats?\\n- Should the beta include offline sync?\\n- Who owns the partner case studies?\\n\\nWant me to turn these into tasks for this week?"
        }), 200); 1`
    ]
  }
]

function run(theme) {
  const dir = join(scratch, theme)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const settings = `(async () => { await window.app.setSettings({ theme: '${theme}', canvas: { showMinimap: false }, onboarding: { welcomeSeen: true } }); return 1 })()`
  const steps = [seed, settings]
  const keep = []
  for (const s of shots) {
    steps.push(...s.steps, park)
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
      CANVASCL_MCP_PORT: process.env.CANVASCL_MCP_PORT ?? '3852',
      CANVASCL_DATA_DIR: join(dir, 'data'),
      CANVASCL_SHOT: join(dir, 's.png'),
      CANVASCL_SCRIPT: join(dir, 'steps.js'),
      CANVASCL_QUIT: '1'
    },
    timeout: 300_000
  })
  for (const line of `${res.stdout}\n${res.stderr}`.split('\n')) if (/\[shot\]/.test(line)) console.log('  ', line.trim())
  mkdirSync(outDir, { recursive: true })
  for (const k of keep) {
    const src = join(dir, `s-${k.index}.png`)
    if (!existsSync(src)) throw new Error(`missing capture ${src}`)
    const out = join(outDir, `${k.name}-${theme}.webp`)
    execFileSync('cwebp', ['-quiet', '-q', '80', '-m', '6', '-resize', String(WIDTH), '0', src, '-o', out])
    console.log(`  → ${out.replace(root + '/', '')} (${Math.round(statSync(out).size / 1024)} KB)`)
  }
}

for (const t of themes) run(t)
execFileSync('sips', ['-Z', '128', join(root, 'build/icon.png'), '--out', join(outDir, 'app-icon.png')], { stdio: 'ignore' })
console.log('done')

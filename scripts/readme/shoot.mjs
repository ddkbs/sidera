#!/usr/bin/env node
/**
 * Renders the README screenshots into docs/screenshots/ using the devShot hook (see CLAUDE.md).
 * Reuses the onboarding demo seed (scripts/onboarding/seed.js — smaller boards, cards, tasks) and adds the big
 * showcase board (scripts/readme/showcase.js — "Orbitra", with images from scripts/readme/assets) plus a sample
 * PDF with highlights.
 *
 * The iPad shots run the real iPad web app (out/ipad) in headless Google Chrome emulating an iPad (scripts/readme/cdp.mjs):
 * the app shares the board and creates a pairing, Chrome pairs like a scanned QR code, captures the live board and
 * frames it in a drawn iPad bezel.
 *
 *   node scripts/readme/shoot.mjs            # everything
 *   node scripts/readme/shoot.mjs ipad       # only the iPad shots
 *   node scripts/readme/shoot.mjs site       # every desktop view in dark mode for the website (website/src/shots)
 *
 * Needs `cwebp` (brew install webp) and Google Chrome. Never touches the real data dir — everything runs against a
 * throw-away scratch dir. Env: SIDERA_MCP_PORT (default 3860), SIDERA_IPAD_PORT (default 47890), README_SHOTS_DIR (scratch).
 */
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSamplePdf, SAMPLE_HIGHLIGHTS } from './sample-pdf.mjs'
import { chatExchange, openBoard } from '../onboarding/shoot.mjs'
import { launchIpadChrome } from './cdp.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const outDir = join(root, process.argv[2] === 'site' ? 'website/src/shots' : 'docs/screenshots')
const scratch = process.env.README_SHOTS_DIR ?? join(tmpdir(), 'sidera-readme-shots')
const port = process.env.SIDERA_MCP_PORT ?? '3860'
const onboardingSeed = readFileSync(join(root, 'scripts/onboarding/seed.js'), 'utf8')
const pdfBase64 = buildSamplePdf().toString('base64')
const ipadPort = process.env.SIDERA_IPAD_PORT ?? '47890'
const assetDir = join(root, 'scripts/readme/assets')
const assets = Object.fromEntries(readdirSync(assetDir).map((f) => [f, readFileSync(join(assetDir, f)).toString('base64')]))
const showcaseSeed = readFileSync(join(root, 'scripts/readme/showcase.js'), 'utf8').replace('__ASSETS__', JSON.stringify(assets))

const ZOOM = 1.25
const WIDTH = 1600
const HERO_WIDTH = 2400

/** Opens the Orbitra showcase board at a board viewport; the sidebar stays closed so the board gets the whole window. */
const showcase = `(await window.api.listWhiteboards()).find((b) => b.name.startsWith('Orbitra'))`
const openShowcase = (viewport) => `(async () => {
  const b = ${showcase}
  await window.api.updateWhiteboard({ id: b.id, viewport: ${JSON.stringify(viewport)} })
  localStorage['sidera.ui'] = JSON.stringify({ sidebarOpen: false, chatOpen: false, tabs: [{ id: 't1', view: { type: 'whiteboard', id: b.id } }], activeTabId: 't1' })
  setTimeout(() => location.reload(), 50)
})()`
const settle = (ms = 1200) => `new Promise((r) => setTimeout(() => r(1), ${ms}))`

const ui = (view, extra = '') => `(async () => {
  ${extra}
  localStorage['sidera.ui'] = JSON.stringify({ sidebarOpen: true, chatOpen: ${view.chat ? 'true' : 'false'}, tabs: [{ id: 't1', view: ${view.expr} }], activeTabId: 't1'${view.pdf ? `, pdf: ${view.pdf}` : ''} })
  setTimeout(() => location.reload(), 50)
})()`
const zoomStep = `document.documentElement.style.zoom = '${ZOOM}'; window.dispatchEvent(new Event('resize')); 1`
const park = '@click 700 860'
const tag = (name) => `(await window.api.listTags()).find((t) => t.name === ${JSON.stringify(name)})`

/** README-only extra content: a sample PDF with two highlights. */
const extraSeedStep = `(async () => {
  const api = window.api
  const rec = await api.importFileData({ name: 'Local-first knowledge tools.pdf', mime: 'application/pdf', dataBase64: '${pdfBase64}' })
  localStorage.setItem('sidera.readme.pdfFileId', rec.id)
  ${SAMPLE_HIGHLIGHTS.map(
    (h) =>
      `await api.createHighlight({ fileId: rec.id, page: 1, text: ${JSON.stringify(h.text)}, rects: [${JSON.stringify(h.rect)}], color: ${JSON.stringify(h.color)} })`
  ).join('\n  ')}
  return { pdfFileId: rec.id }
})()`

const settings = (extra = {}) =>
  `(async () => { await window.app.setSettings({ theme: 'light', canvas: { showMinimap: false }, onboarding: { welcomeSeen: true }, ...${JSON.stringify(extra)} }); return 1 })()`

/** Each shot: steps that lead to it (the last step's PNG is the one kept) + output width. Showcase shots end with a
 * click on empty board so no node shows its hover handles. */
const shots = [
  { name: 'hero', width: HERO_WIDTH, noPark: true, steps: [openShowcase({ x: 70, y: 84, zoom: 0.5 }), settle(), '@click 600 78'] },
  { name: 'charts', width: HERO_WIDTH, noPark: true, steps: [openShowcase({ x: -218, y: -339, zoom: 0.72 }), settle(), '@click 936 353'] },
  { name: 'home', steps: [ui({ expr: `{ type: 'home' }` }), zoomStep, settle(600)], noPark: true },
  {
    name: 'pen-mode',
    noPark: true,
    steps: [openShowcase({ x: -360, y: 90, zoom: 0.95 }), zoomStep, '@click [aria-label="Pen"]', settle(400)]
  },
  {
    name: 'library-search',
    noPark: true,
    steps: [ui({ expr: `{ type: 'library', tagId: t.id, mode: 'table' }` }, `const t = ${tag('Q4 launch')}`), zoomStep, '@key meta+k', '@type pricing']
  },
  { name: 'tasks', steps: [ui({ expr: `{ type: 'tasks' }` }), zoomStep] },
  {
    name: 'pdf-reader',
    steps: [
      ui({ expr: `{ type: 'home' }`, pdf: `{ fileId: localStorage.getItem('sidera.readme.pdfFileId'), name: 'Local-first knowledge tools.pdf' }` }),
      zoomStep
    ]
  },
  { name: 'ai-chat', noPark: true, steps: [openBoard({ x: 90, y: 96, zoom: 0.36 }, true), zoomStep, '@click 600 760', `${chatExchange}; new Promise((r) => setTimeout(() => r(1), 600))`] },
  {
    // The scratch shoot runs on SIDERA_MCP_PORT=3860 to avoid colliding with a real running app;
    // cosmetically swap it back to the documented default (3845) so the screenshot matches the docs.
    name: 'mcp-connect',
    noPark: true,
    steps: [
      ui({ expr: `{ type: 'home' }` }),
      zoomStep,
      '@key meta+,',
      '@click text=MCP & Claude',
      `(() => { const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); const nodes = []; let n; while ((n = walk.nextNode())) nodes.push(n); for (const node of nodes) if (node.textContent.includes('${port}')) node.textContent = node.textContent.replaceAll('${port}', '3845'); return nodes.length })()`
    ]
  }
]

function run(theme, list) {
  const dir = join(scratch, theme)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const steps = [onboardingSeed, showcaseSeed, settings({ theme }), extraSeedStep]
  const keep = []
  for (const s of list) {
    steps.push(...s.steps)
    if (!s.noPark) steps.push(park)
    keep.push({ name: s.name, index: steps.length - 1, width: s.width ?? WIDTH })
  }
  writeFileSync(join(dir, 'steps.js'), steps.join('\n---\n'))
  console.log(`[${theme}] capturing ${list.length} views…`)
  const res = spawnSync('npx', ['electron-vite', 'dev'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    env: {
      ...process.env,
      SIDERA_MCP_PORT: port,
      SIDERA_DATA_DIR: join(dir, 'data'),
      SIDERA_SHOT: join(dir, 's.png'),
      SIDERA_SCRIPT: join(dir, 'steps.js'),
      SIDERA_QUIT: '1'
    },
    timeout: 300_000
  })
  for (const line of `${res.stdout}\n${res.stderr}`.split('\n')) if (/\[shot\]|\[renderer:error\]/.test(line)) console.log('  ', line.trim())
  mkdirSync(outDir, { recursive: true })
  for (const k of keep) {
    const src = join(dir, `s-${k.index}.png`)
    if (!existsSync(src)) {
      console.log(`  ✗ missing capture for ${k.name} (${src})`)
      continue
    }
    const out = join(outDir, `${k.name}${theme === 'dark' ? '-dark' : ''}.webp`)
    execFileSync('cwebp', ['-quiet', '-q', '82', '-m', '6', '-resize', String(k.width), '0', src, '-o', out])
    console.log(`  → ${out.replace(root + '/', '')} (${Math.round(statSync(out).size / 1024)} KB)`)
  }
}

/** Sign-in screen: a brand-new SIDERA_AUTH_ROOT (no accounts yet) so the "Get started" flow shows. */
function runSignIn() {
  const dir = join(scratch, 'signin')
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'steps.js'), [zoomStep].join('\n---\n'))
  console.log('[signin] capturing sign-in screen…')
  const res = spawnSync('npx', ['electron-vite', 'dev'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    env: {
      ...process.env,
      SIDERA_MCP_PORT: port,
      SIDERA_AUTH_ROOT: dir,
      SIDERA_SHOT: join(dir, 's.png'),
      SIDERA_SCRIPT: join(dir, 'steps.js'),
      SIDERA_QUIT: '1'
    },
    timeout: 120_000
  })
  for (const line of `${res.stdout}\n${res.stderr}`.split('\n')) if (/\[shot\]|\[renderer:error\]/.test(line)) console.log('  ', line.trim())
  const src = join(dir, 's-0.png')
  if (!existsSync(src)) return console.log('  ✗ missing sign-in capture')
  const out = join(outDir, 'signin.webp')
  execFileSync('cwebp', ['-quiet', '-q', '82', '-m', '6', '-resize', String(WIDTH), '0', src, '-o', out])
  console.log(`  → ${out.replace(root + '/', '')} (${Math.round(statSync(out).size / 1024)} KB)`)
}

/** Welcome / onboarding-tour slides: force welcomeSeen=false so it shows automatically on load. */
function runWelcome() {
  const dir = join(scratch, 'welcome')
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const steps = [onboardingSeed, settings({ onboarding: { welcomeSeen: false } }), ui({ expr: `{ type: 'home' }` }), zoomStep]
  writeFileSync(join(dir, 'steps.js'), steps.join('\n---\n'))
  console.log('[welcome] capturing onboarding slides…')
  const res = spawnSync('npx', ['electron-vite', 'dev'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    env: {
      ...process.env,
      SIDERA_MCP_PORT: port,
      SIDERA_DATA_DIR: join(dir, 'data'),
      SIDERA_SHOT: join(dir, 's.png'),
      SIDERA_SCRIPT: join(dir, 'steps.js'),
      SIDERA_QUIT: '1'
    },
    timeout: 120_000
  })
  for (const line of `${res.stdout}\n${res.stderr}`.split('\n')) if (/\[shot\]|\[renderer:error\]/.test(line)) console.log('  ', line.trim())
  const src = join(dir, `s-${steps.length - 1}.png`)
  if (!existsSync(src)) return console.log('  ✗ missing welcome capture')
  const out = join(outDir, 'welcome.webp')
  execFileSync('cwebp', ['-quiet', '-q', '82', '-m', '6', '-resize', String(WIDTH), '0', src, '-o', out])
  console.log(`  → ${out.replace(root + '/', '')} (${Math.round(statSync(out).size / 1024)} KB)`)
}

/** iPad screen in CSS px (iPad Air 11", landscape) and the drawn bezel around it. */
const IPAD = { width: 1180, height: 820, scale: 2 }
const IPAD_WIDTH = 1600

/** Draws the iPad bezel around a screen capture (headless Chrome, transparent page) → PNG. */
async function frameIpad(chrome, screenPng, dir) {
  const [w, h] = [IPAD.width, IPAD.height]
  const html = `<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0;background:transparent}
    .wrap{padding:44px 56px 64px}
    .ipad{width:${w}px;height:${h}px;padding:26px;border-radius:52px;background:#1a1a1c;
      box-shadow:0 0 0 2px #3a3a3e inset,0 0 0 1.5px #9a9aa0,0 30px 60px -18px rgba(15,23,42,.45),0 12px 24px -12px rgba(15,23,42,.3);position:relative}
    .ipad::before{content:'';position:absolute;left:50%;top:11px;width:7px;height:7px;margin-left:-3.5px;border-radius:50%;background:#2c2c30;box-shadow:inset 0 0 0 1.5px #111}
    img{display:block;width:${w}px;height:${h}px;border-radius:20px}
  </style><div class="wrap"><div class="ipad"><img src="data:image/png;base64,${screenPng.toString('base64')}"></div></div>`
  const file = join(dir, 'frame.html')
  writeFileSync(file, html)
  const fw = w + 52 + 112
  const fh = h + 52 + 108
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: fw, height: fh, deviceScaleFactor: IPAD.scale, mobile: false })
  await chrome.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } })
  await chrome.goto(`file://${file}`, 800)
  return chrome.shot()
}

/**
 * One iPad shot: the dev app seeds + shares the showcase board and creates a pairing (step output `IPADURL`), then
 * waits while headless Chrome pairs (like a scanned QR code), reloads as the paired home-screen app and captures.
 */
async function runIpad({ name, theme, viewport, picker = false }) {
  const dir = join(scratch, `ipad-${name}`)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const steps = [
    onboardingSeed,
    showcaseSeed,
    // the iPad mirrors the Mac's language setting; pin it, null would follow this Mac's system language
    settings({ theme, language: 'en' }),
    `(async () => {
      const b = ${showcase}
      await window.api.updateWhiteboard({ id: b.id, viewport: ${JSON.stringify(viewport)} })
      await window.ipad.start()
      const p = await window.ipad.pair()
      return { IPADURL: p.ipUrl, BOARD: b.id }
    })()`,
    settle(90_000)
  ]
  writeFileSync(join(dir, 'steps.js'), steps.join('\n---\n'))
  console.log(`[ipad ${name}] capturing…`)
  // own process group: killing it also ends Electron (a plain kill would only stop npx)
  const app = spawn('npx', ['electron-vite', 'dev'], {
    cwd: root,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      SIDERA_MCP_PORT: port,
      SIDERA_IPAD_PORT: ipadPort,
      SIDERA_DATA_DIR: join(dir, 'data'),
      SIDERA_SHOT: join(dir, 's.png'),
      SIDERA_SCRIPT: join(dir, 'steps.js'),
      SIDERA_QUIT: '1'
    }
  })
  let log = ''
  const { url, board } = await new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error('no pairing URL within 3 min')), 180_000)
    const on = (d) => {
      log += d
      const m = /"IPADURL":"([^"]+)","BOARD":"([^"]+)"/.exec(log)
      if (m) clearTimeout(timer), res({ url: m[1], board: m[2] })
    }
    app.stdout.on('data', on)
    app.stderr.on('data', on)
    app.on('exit', () => rej(new Error(`app exited before pairing:\n${log.slice(-2000)}`)))
  })
  const chrome = await launchIpadChrome({ profileDir: join(dir, 'chrome'), ...IPAD, dark: theme === 'dark' })
  try {
    await chrome.goto(url, 4000)
    // the iPad reopens the board it had open last (the board list otherwise)
    await chrome.eval(`localStorage.${picker ? `removeItem('sidera.ipad.board')` : `setItem('sidera.ipad.board', ${JSON.stringify(board)})`}; 1`)
    await chrome.goto(url.replace(/#.*$/, ''), 6000)
    // the board list shows the Mac's own name — swap in a generic one
    await chrome.eval(`(() => { const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = walk.nextNode())) if (/^· /.test(n.textContent)) n.textContent = '· MacBook Pro'; return 1 })()`)
    const screen = await chrome.shot()
    writeFileSync(join(dir, 'screen.png'), screen)
    const framed = await frameIpad(chrome, screen, dir)
    writeFileSync(join(dir, 'framed.png'), framed)
    const out = join(outDir, `${name}.webp`)
    execFileSync('cwebp', ['-quiet', '-q', '84', '-m', '6', '-alpha_q', '100', '-resize', String(IPAD_WIDTH), '0', join(dir, 'framed.png'), '-o', out])
    console.log(`  → ${out.replace(root + '/', '')} (${Math.round(statSync(out).size / 1024)} KB)`)
  } finally {
    chrome.close()
    process.kill(-app.pid)
  }
}

const ipadShots = [
  { name: 'ipad', theme: 'light', viewport: { x: 96, y: 58, zoom: 0.42 } },
  { name: 'ipad-dark', theme: 'dark', viewport: { x: -176, y: -302, zoom: 0.62 } },
  { name: 'ipad-boards', theme: 'light', viewport: { x: 96, y: 58, zoom: 0.42 }, picker: true },
  { name: 'ipad-boards-dark', theme: 'dark', viewport: { x: 96, y: 58, zoom: 0.42 }, picker: true }
]

const only = process.argv[2]
if (!only || only === 'desktop') {
  run('light', shots)
  run('dark', shots.filter((s) => s.name === 'hero'))
  runSignIn()
  runWelcome()
}
if (only === 'site') run('dark', shots)
if (!only || only === 'ipad') for (const s of ipadShots) await runIpad(s)
console.log('done')

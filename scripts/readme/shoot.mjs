#!/usr/bin/env node
/**
 * Renders the README screenshots into docs/screenshots/ using the devShot hook (see CLAUDE.md).
 * Reuses the onboarding demo seed (scripts/onboarding/seed.js) plus a small amount of README-only
 * content (a sample PDF with highlights, a mindmap) added in its own step.
 *
 *   node scripts/readme/shoot.mjs
 *
 * Needs `cwebp` (brew install webp). Never touches the real data dir — everything runs against a
 * throw-away scratch dir. Env: SIDERA_MCP_PORT (default 3860), README_SHOTS_DIR (scratch).
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSamplePdf, SAMPLE_HIGHLIGHTS } from './sample-pdf.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const outDir = join(root, 'docs/screenshots')
const scratch = process.env.README_SHOTS_DIR ?? join(tmpdir(), 'sidera-readme-shots')
const port = process.env.SIDERA_MCP_PORT ?? '3860'
const onboardingSeed = readFileSync(join(root, 'scripts/onboarding/seed.js'), 'utf8')
const pdfBase64 = buildSamplePdf().toString('base64')

const ZOOM = 1.25
const WIDTH = 1600
const HERO_WIDTH = 2000

const ui = (view, extra = '') => `(async () => {
  ${extra}
  localStorage['sidera.ui'] = JSON.stringify({ sidebarOpen: true, chatOpen: ${view.chat ? 'true' : 'false'}, tabs: [{ id: 't1', view: ${view.expr} }], activeTabId: 't1'${view.pdf ? `, pdf: ${view.pdf}` : ''} })
  setTimeout(() => location.reload(), 50)
})()`
const zoomStep = `document.documentElement.style.zoom = '${ZOOM}'; window.dispatchEvent(new Event('resize')); 1`
const park = '@click 700 860'
const board = `(await window.api.listWhiteboards()).find((b) => b.name.startsWith('Atlas'))`
const tag = (name) => `(await window.api.listTags()).find((t) => t.name === ${JSON.stringify(name)})`

/** README-only extra content: a mindmap on the launch board, plus a sample PDF with two highlights. */
const extraSeedStep = `(async () => {
  const api = window.api
  const b = ${board}
  await api.addObject({
    whiteboardId: b.id, kind: 'mindmap', x: 0, y: 570, width: 660, height: 280,
    data: { source: 'Positioning\\n  - Local-first\\n    - No account required\\n    - Data stays on device\\n  - MCP-first\\n    - Claude Desktop\\n    - Claude Code\\n  - Fast to start\\n    - Guided tour' }
  })
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

const chatStep =
  zoomStep +
  `; setTimeout(() => window.__devChatMessage?.('Link my research to the launch goals and add a card with open questions', {
      tools: ['search_cards', 'connect_objects', 'create_card', 'add_card_to_whiteboard'],
      text: "Done — I connected **Interview synthesis** and **Pricing survey** to *Launch goals* and added an **Open questions** card next to them:\\n\\n- Which tier do teams expect for 5+ seats?\\n- Should the beta include offline sync?\\n- Who owns the partner case studies?\\n\\nWant me to turn these into tasks for this week?"
    }), 200); 1`

/** Each shot: steps that lead to it (the last step's PNG is the one kept) + output width. */
const shots = [
  {
    name: 'hero',
    width: HERO_WIDTH,
    steps: [
      ui(
        { expr: `{ type: 'whiteboard', id: b.id }` },
        `const b = ${board}; await window.api.updateWhiteboard({ id: b.id, viewport: { x: 55, y: 140, zoom: 0.42 } })`
      ),
      zoomStep
    ]
  },
  {
    name: 'library-search',
    noPark: true,
    steps: [ui({ expr: `{ type: 'library', tagId: t.id, mode: 'table' }` }, `const t = ${tag('Atlas v2')}`), zoomStep, '@key meta+k', '@type pricing']
  },
  { name: 'kanban', steps: [ui({ expr: `{ type: 'library', tagId: t.id, mode: 'kanban' }` }, `const t = ${tag('Atlas v2')}`), zoomStep] },
  { name: 'tasks', steps: [ui({ expr: `{ type: 'tasks' }` }), zoomStep] },
  {
    name: 'pdf-reader',
    steps: [
      ui({ expr: `{ type: 'home' }`, pdf: `{ fileId: localStorage.getItem('sidera.readme.pdfFileId'), name: 'Local-first knowledge tools.pdf' }` }),
      zoomStep
    ]
  },
  {
    name: 'ai-chat',
    steps: [
      ui(
        { expr: `{ type: 'whiteboard', id: b.id }`, chat: true },
        `const b = ${board}; await window.api.updateWhiteboard({ id: b.id, viewport: { x: 100, y: 150, zoom: 0.5 } })`
      ),
      chatStep
    ]
  },
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
  const steps = [onboardingSeed, settings({ theme }), extraSeedStep]
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

run('light', shots)
run('dark', [shots[0]])
runSignIn()
runWelcome()
console.log('done')

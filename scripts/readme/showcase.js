// Renderer-side seed for the README's big showcase board (run as a devShot step after scripts/onboarding/seed.js).
// "Orbitra — satellite internet", a fictional company: logo + illustrations (scripts/readme/assets/*.svg, injected
// as base64 by shoot.mjs), a hand-drawn orbit scene, flywheel, timeline, waterfall, a table-linked chart that
// changes colour at break-even, revenue (green above €1bn) / subscriber / cash-flow / segment charts, framed notes and pen ink.
// Only ever run this against a scratch SIDERA_DATA_DIR.
;(async () => {
  const api = window.api
  const ASSETS = __ASSETS__

  // ---------- ink (same element shape as pen mode; mirrors src/shared/inkSeed.ts) ----------
  const DIAM = 4.25 * 2 * Math.SQRT1_2
  const r2 = (n) => Math.round(n * 100) / 100
  const seg = (a, b, n = 6) => Array.from({ length: n + 1 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n])
  const poly = (...pts) => pts.slice(1).flatMap((p, i) => seg(pts[i], p, 8).slice(i ? 1 : 0))
  const underline = (x1, x2, y, seed = 1) => {
    const n = Math.max(8, Math.round(Math.abs(x2 - x1) / 18))
    return Array.from({ length: n + 1 }, (_, i) => {
      const t = i / n
      return [x1 + (x2 - x1) * t, y + Math.sin(seed + t * Math.PI * 1.6) * 2.2 + (t - 0.5) * 3]
    })
  }
  const loop = (cx, cy, rx, ry, seed = 1, turns = 1.12) =>
    Array.from({ length: 57 }, (_, i) => {
      const t = i / 56
      const a = -Math.PI * 0.7 + t * turns * Math.PI * 2
      const k = 1 + 0.06 * t + Math.sin(t * 7 + seed) * 0.015
      return [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]
    })
  const quad = ([x1, y1], c, [x2, y2], n = 40) =>
    Array.from({ length: n + 1 }, (_, i) => {
      const t = i / n
      const u = 1 - t
      return [u * u * x1 + 2 * u * t * c[0] + t * t * x2, u * u * y1 + 2 * u * t * c[1] + t * t * y2]
    })
  const head = (from, [x2, y2], s = 16) => {
    const d = Math.hypot(x2 - from[0], y2 - from[1]) || 1
    const ux = (x2 - from[0]) / d
    const uy = (y2 - from[1]) / d
    const wing = (k) => [x2 - ux * s - uy * s * 0.6 * k, y2 - uy * s + ux * s * 0.6 * k]
    return [...seg(wing(1), [x2, y2]), ...seg([x2, y2], wing(-1)).slice(1)]
  }
  const arrow = (a, b, bend = 30, s = 16) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
    const c = [(a[0] + b[0]) / 2 - ((b[1] - a[1]) / len) * bend, (a[1] + b[1]) / 2 + ((b[0] - a[0]) / len) * bend]
    return [quad(a, c, b, 20), head(c, b, Math.min(s, len * 0.3))]
  }
  /** a sampled path cut into dashes */
  const dashes = (pts, on = 3, off = 2) => {
    const out = []
    for (let i = 0; i + on < pts.length; i += on + off) out.push(pts.slice(i, i + on + 1))
    return out
  }
  const element = (st, id) => {
    const [x0, y0] = st.points[0]
    const rel = st.points.map(([x, y]) => [r2(x - x0), r2(y - y0)])
    const xs = rel.map((p) => p[0])
    const ys = rel.map((p) => p[1])
    return {
      id, type: 'freedraw', x: r2(x0), y: r2(y0), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys),
      strokeColor: st.color ?? '#1e1e1e', backgroundColor: 'transparent', fillStyle: 'solid', strokeWidth: r2((st.width ?? 4.5) / DIAM),
      strokeStyle: 'solid', roughness: 0, opacity: Math.round((st.opacity ?? 1) * 100), angle: 0, seed: 7, groupIds: [], locked: false,
      roundness: null, points: rel, pressures: [], simulatePressure: true, lastCommittedPoint: rel[rel.length - 1], version: 1,
      versionNonce: 1, isDeleted: false, boundElements: null, updated: 0, link: null, frameId: null
    }
  }
  const ink = async (whiteboardId, strokes, prefix) => {
    let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity]
    for (const s of strokes) {
      const half = ((s.width ?? 4.5) / DIAM) * 4.25 * 0.5 + 2
      for (const [x, y] of s.points) [minX, minY, maxX, maxY] = [Math.min(minX, x - half), Math.min(minY, y - half), Math.max(maxX, x + half), Math.max(maxY, y + half)]
    }
    return api.addObject({
      whiteboardId, kind: 'sketch', x: minX, y: minY, width: maxX - minX, height: maxY - minY,
      data: { elements: strokes.map((s, i) => element(s, `${prefix}-${i}`)), files: {}, frameless: true }
    })
  }
  const BLUE = '#1971c2'
  const RED = '#e03131'
  const ORANGE = '#f08c00'
  const GREEN = '#2f9e44'
  const GRAY = '#868e96'

  // ---------- helpers ----------
  const board = await api.createWhiteboard({ name: 'Orbitra — satellite internet' })
  const w = board.id
  const block = (x, y, markdown, width = 340, style = 'plain', fontSize) => api.addTextBlock({ whiteboardId: w, x, y, width, markdown, style, ...(fontSize ? { fontSize } : {}) })
  const tint = (res, color) => api.updateCard({ id: res.card.id, color })
  const image = async (name, x, y, width, height, rotation) => {
    const rec = await api.importFileData({ name, mime: 'image/svg+xml', dataBase64: ASSETS[name] })
    return api.addObject({ whiteboardId: w, kind: 'file', refId: rec.id, x, y, width, height, data: { name, mime: 'image/svg+xml', ...(rotation ? { rotation } : {}) } })
  }
  const chart = (x, y, width, height, data) => api.addObject({ whiteboardId: w, kind: 'chart', x, y, width, height, data: { options: {}, ...data } })
  let rid = 0
  const table = (title, columns, rows) => {
    const cols = columns.map(([name, type]) => ({ id: `c${++rid}`, name, ...(type ? { type } : {}) }))
    return { title, header: true, columns: cols, rows: rows.map((r) => ({ id: `r${++rid}`, cells: Object.fromEntries(cols.map((c, i) => [c.id, r[i]])) })) }
  }

  // ================= header =================
  await image('logo.svg', 0, 6, 92, 92)
  await api.addTextBlock({ whiteboardId: w, x: 104, y: 4, width: 420, markdown: '# Orbitra', fontSize: 34 })
  await block(4, 112, 'Satellite internet from low Earth orbit · Lisbon · *a fictional company for this example board*', 400)
  await ink(w, [{ points: underline(108, 330, 84, 2), color: BLUE }], 'title')

  // ================= left column: facts + unfair advantage =================
  await api.addObject({
    whiteboardId: w, kind: 'table', x: 0, y: 200, width: 380, height: 320,
    data: table('Company facts', [['Fact'], ['Value']], [
      ['Founded', '2019'],
      ['HQ', 'Lisbon, Portugal'],
      ['Satellites', '~1,240 in orbit'],
      ['Altitude', '550 km'],
      ['Markets', '38 countries'],
      ['Subscribers', '2.4m (Q2 2026)'],
      ['Team', '~1,900 people']
    ])
  })
  const unfair = await block(0, 560, '**Unfair advantage**\n\n- Own launch partner — cost per kg **−70%**\n- Laser mesh: no ground station needed mid-ocean\n- Dish made in-house for **€190**', 380, 'framed')
  await tint(unfair, 'yellow')

  // ================= orbit scene =================
  const earthY = 404
  await image('earth.svg', 430, earthY, 1130, 188)
  const arcA = [470, 340]
  const arcC = [995, -40]
  const arcB = [1520, 340]
  await ink(w, dashes(quad(arcA, arcC, arcB, 120)).map((points) => ({ points, color: BLUE, width: 2.5, opacity: 0.8 })), 'orbit')
  const sats = [0.22, 0.5, 0.78].map((t) => {
    const u = 1 - t
    return [u * u * arcA[0] + 2 * u * t * arcC[0] + t * t * arcB[0], u * u * arcA[1] + 2 * u * t * arcC[1] + t * t * arcB[1]]
  })
  for (const [i, [sx, sy]] of sats.entries()) await image('satellite.svg', sx - 80, sy - 38, 160, 75, [-14, 0, 14][i])
  // laser links between the satellites
  await ink(w, [
    { points: poly([sats[0][0] + 50, sats[0][1] - 26], [sats[1][0] - 50, sats[1][1] - 22]), color: RED, width: 2.5 },
    { points: poly([sats[1][0] + 50, sats[1][1] - 22], [sats[2][0] - 50, sats[2][1] - 26]), color: RED, width: 2.5 }
  ], 'laser')
  await block(sats[1][0] - 110, sats[1][1] - 112, '**Laser links** · 200 Gbit/s between satellites', 220)

  // ground: dish, laptop, ground station
  await image('terminal.svg', 560, 300, 120, 120)
  await image('laptop.svg', 690, 362, 84, 55)
  await image('ground-station.svg', 1290, 290, 168, 140)
  await block(452, 226, 'Your **dish** + Wi-Fi', 150)
  await block(1440, 236, '**Ground station** → internet', 150)
  // beams: dish ↗ first satellite, last satellite ↘ ground station (dashed orange)
  await ink(w, [
    ...dashes(seg([626, 312], [sats[0][0] - 6, sats[0][1] + 34], 40), 2, 2).map((points) => ({ points, color: ORANGE, width: 3 })),
    ...dashes(seg([sats[2][0] + 6, sats[2][1] + 34], [1336, 318], 40), 2, 2).map((points) => ({ points, color: ORANGE, width: 3 }))
  ], 'beam')
  // altitude
  await ink(w, [
    { points: poly([995, sats[1][1] + 46], [995, earthY + 26]), color: GRAY, width: 2.5 },
    { points: head([995, earthY], [995, sats[1][1] + 44], 12), color: GRAY, width: 2.5 },
    { points: head([995, sats[1][1]], [995, earthY + 28], 12), color: GRAY, width: 2.5 }
  ], 'alt')
  await block(1006, 250, '**550 km**', 100, 'plain', 18)

  // ================= flywheel =================
  await block(1640, 0, '**Flywheel** — why it gets cheaper every year', 420)
  const fc = [1960, 300]
  const fr = 200
  const steps = ['More subscribers', 'More revenue', 'More satellites launched', 'Faster network, lower latency', 'Lower price per GB']
  const angles = [-90, -18, 54, 126, 198]
  for (const [i, text] of steps.entries()) {
    const a = (angles[i] * Math.PI) / 180
    const nb = await block(fc[0] + Math.cos(a) * fr - 85, fc[1] + Math.sin(a) * fr - 22, `**${text}**`, 170, 'framed')
    if (i === 0) await tint(nb, 'blue')
  }
  const at = (deg, r = fr) => [fc[0] + Math.cos((deg * Math.PI) / 180) * r, fc[1] + Math.sin((deg * Math.PI) / 180) * r]
  await ink(w, angles.flatMap((deg, i) => arrow(at(deg + 22, fr + 8), at(deg + 50, fr + 8), -16, 13).map((points) => ({ points, color: BLUE, width: 3 }))), 'fly')
  await block(fc[0] - 70, fc[1] - 26, '**Scale ↻**\nevery turn adds speed', 140, 'plain', 15)

  // ================= timeline + waterfall =================
  await chart(430, 640, 1130, 240, {
    chartType: 'timeline', title: 'Company history', columns: ['Date', 'Title', 'Detail'], options: {},
    rows: [
      ['2019-04-01', 'Founded', 'Spin-off, 14 people'],
      ['2020-11-01', 'First prototype', 'Two test satellites'],
      ['2022-03-01', 'Beta', '10,000 users in Portugal'],
      ['2023-06-01', 'Laser links', 'Satellites talk to each other'],
      ['2024-09-01', '1m subscribers', '22 countries'],
      ['2025-02-01', 'Break-even', 'First profitable quarter'],
      ['2026-05-01', 'Direct-to-phone', 'Texting from any handset']
    ]
  })
  await chart(1640, 560, 620, 320, {
    chartType: 'waterfall', title: 'Unit economics per subscriber / year (€)', columns: ['Label', 'Value'],
    rows: [['Subscription', '1080'], ['Dish subsidy', '-180'], ['Satellites & launch', '-310'], ['Ground & ops', '-140'], ['Support', '-60']],
    options: { totalLabel: 'Contribution', showTotal: true }
  })

  // ================= numbers =================
  const ebitda = await api.addObject({
    whiteboardId: w, kind: 'table', x: 0, y: 940, width: 300, height: 330,
    data: table('EBITDA (€m)', [['Quarter'], ['EBITDA', 'number']], [
      ['Q1 24', -48], ['Q2 24', -36], ['Q3 24', -21], ['Q4 24', -9], ['Q1 25', 4], ['Q2 25', 17], ['Q3 25', 29], ['Q4 25', 44]
    ])
  })
  const linked = await api.chartFromTable({ tableId: ebitda.id, chartType: 'column' })
  await api.updateObjects([{
    id: linked.id, x: 330, y: 940, width: 540, height: 330,
    data: { ...linked.data, title: 'EBITDA by quarter (€m)', options: { ...linked.data.options, legend: false, split: { value: 0, above: 'oklch(0.62 0.17 255)', below: 'oklch(0.65 0.2 15)' }, yTicks: [{ value: 0, label: 'Break-even' }] } }
  }])
  await chart(900, 940, 520, 330, {
    chartType: 'area', title: 'Subscribers (m)', columns: ['Quarter', 'Subscribers'],
    rows: [['Q1 24', '0.6'], ['Q2 24', '0.8'], ['Q3 24', '1.0'], ['Q4 24', '1.2'], ['Q1 25', '1.4'], ['Q2 25', '1.6'], ['Q3 25', '1.8'], ['Q4 25', '2.1'], ['Q2 26', '2.4']],
    options: { legend: false, curve: 'spline', hideDots: true, markers: [{ x: 'Q2 26', label: '2.4m' }] }
  })
  await chart(1450, 940, 500, 330, {
    chartType: 'area', title: 'Cumulative cash flow per satellite', columns: ['Year', '€m'],
    rows: [['', '0'], ['Build & launch', '-1.4'], ['1', '-0.6'], ['2', '0.3'], ['3', '1.2'], ['4', '2.1'], ['5', '3.0']],
    options: {
      legend: false, curve: 'spline', hideDots: true, xAxisTitle: 'Year in orbit', yAxisTitle: '€m',
      markers: [{ x: '5', label: 'deorbits' }], split: { value: 0, above: 'oklch(0.62 0.17 255)', below: 'oklch(0.65 0.2 15)' }
    }
  })
  await chart(1980, 940, 340, 330, {
    chartType: 'donut', title: 'Revenue 2025 by segment', columns: ['Label', 'Value'],
    rows: [['Homes', '58'], ['Maritime', '17'], ['Aviation', '14'], ['Government', '11']], options: { legend: true }
  })

  // ================= bottom row =================
  await chart(0, 1320, 540, 300, {
    chartType: 'column', title: 'Revenue (€m)', columns: ['Year', 'Revenue'],
    rows: [['2021', '12'], ['2022', '85'], ['2023', '260'], ['2024', '540'], ['2025', '910'], ['2026e', '1420']],
    options: {
      legend: false, yTicks: [{ value: 1000, label: '€1bn' }], markers: [{ x: '2025', label: '+68%' }],
      split: { value: 1000, above: 'oklch(0.63 0.17 150)', below: 'oklch(0.62 0.17 255)' }
    }
  })
  const risks = await block(580, 1320, '**Risks**\n\n- Spectrum licences per country\n- Space debris & deorbit rules\n- Rival constellations price-match', 300, 'framed')
  await tint(risks, 'red')
  const vision = await block(910, 1320, '**Vision 2030**\n\n- Every phone gets a satellite fallback\n- 10m subscribers, 60 countries\n- Laser backbone between continents', 320, 'framed')
  await tint(vision, 'blue')
  const ideas = await block(1260, 1320, '**Ideas**\n\n- Bundle with camper vans 🚐\n- Offline maps over satellite\n- Partner with Nimbus for launches', 280, 'framed')
  await tint(ideas, 'green')

  // sketched launch vehicle + caption
  const bx = 1700
  await ink(w, [
    { points: poly([bx - 22, 1580], [bx - 22, 1382], [bx, 1322], [bx + 22, 1382], [bx + 22, 1580], [bx - 22, 1580]) },
    { points: loop(bx, 1414, 9, 9, 2, 1.05) },
    { points: poly([bx - 22, 1490], [bx + 22, 1490]), width: 2.5 },
    { points: poly([bx - 22, 1530], [bx - 46, 1574], [bx - 46, 1596], [bx - 22, 1580]) },
    { points: poly([bx + 22, 1530], [bx + 46, 1574], [bx + 46, 1596], [bx + 22, 1580]) },
    { points: poly([bx - 12, 1586], [bx - 4, 1624], [bx + 2, 1598], [bx + 10, 1628], [bx + 14, 1586]), color: ORANGE },
    { points: underline(bx - 100, bx + 100, 1642, 4), width: 2.5 }
  ], 'rocket')
  await block(bx + 70, 1400, '**60 satellites** per launch', 170)
  await ink(w, arrow([bx + 70, 1430], [bx + 30, 1452], 10, 12).map((points) => ({ points, color: BLUE, width: 2.5 })), 'rocket-arrow')
  await block(1900, 1360, '**Next:** v3 satellites, 4× capacity per launch → price per GB **−45%**', 300, 'framed')

  // pen annotations on the charts: circle the first profitable quarter
  await ink(w, [
    { points: loop(668, 1086, 30, 44, 3), color: GREEN },
    ...arrow([560, 1036], [632, 1074], -16).map((points) => ({ points, color: GREEN }))
  ], 'profit')
  await block(420, 1000, '**first profit!**', 150, 'plain', 15)

  return { board: w }
})()

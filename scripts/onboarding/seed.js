// Renderer-side demo seed for the onboarding + README screenshots (run as the first devShot step).
// Wipes the fresh scratch database and fills it with a realistic visual-notes workspace around a fictional
// company, "Nimbus Aerospace": text blocks, a timeline, a revenue table with a linked chart, pen ink and a
// sketched booster — plus a few smaller boards and a card library / tasks for the "More" screenshots.
// Only ever run this against a scratch SIDERA_DATA_DIR — see scripts/onboarding/shoot.mjs.
;(async () => {
  const api = window.api
  for (const b of await api.listWhiteboards()) await api.deleteWhiteboard(b.id)
  for (const c of await api.listCards({ limit: 500, kind: 'all' })) await api.deleteCard(c.id)
  for (const t of await api.listTags()) await api.deleteTag(t.id)

  // ---------- hand-drawn ink (same element shape as pen mode; mirrors src/shared/inkSeed.ts) ----------
  const DIAM = 4.25 * 2 * Math.SQRT1_2
  const r2 = (n) => Math.round(n * 100) / 100
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
  const seg = (a, b, n = 6) => Array.from({ length: n + 1 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n])
  const poly = (...pts) => pts.slice(1).flatMap((p, i) => seg(pts[i], p, 8).slice(i ? 1 : 0))
  const arrow = ([x1, y1], [x2, y2], bend = 30) => {
    const len = Math.hypot(x2 - x1, y2 - y1) || 1
    const c = [(x1 + x2) / 2 - ((y2 - y1) / len) * bend, (y1 + y2) / 2 + ((x2 - x1) / len) * bend]
    const shaft = Array.from({ length: 21 }, (_, i) => {
      const t = i / 20
      const u = 1 - t
      return [u * u * x1 + 2 * u * t * c[0] + t * t * x2, u * u * y1 + 2 * u * t * c[1] + t * t * y2]
    })
    const d = Math.hypot(x2 - c[0], y2 - c[1]) || 1
    const ux = (x2 - c[0]) / d
    const uy = (y2 - c[1]) / d
    const s = Math.min(18, len * 0.3)
    const wing = (k) => [x2 - ux * s - uy * s * 0.6 * k, y2 - uy * s + ux * s * 0.6 * k]
    return [shaft, [...seg(wing(1), [x2, y2]), ...seg([x2, y2], wing(-1)).slice(1)]]
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

  // ---------- helpers ----------
  const block = (whiteboardId, x, y, markdown, width = 340, style = 'plain') => api.addTextBlock({ whiteboardId, x, y, width, markdown, style })
  const tint = async (res, color) => api.updateCard({ id: res.card.id, color })
  const heading = (whiteboardId, x, y, text, size = 44, width = 620) => api.addObject({ whiteboardId, kind: 'text', x, y, width, height: size * 1.4, data: { text, size } })
  let rid = 0
  const table = (title, columns, rows) => {
    const cols = columns.map(([name, type]) => ({ id: `c${++rid}`, name, ...(type ? { type } : {}) }))
    return { title, header: true, columns: cols, rows: rows.map((r) => ({ id: `r${++rid}`, cells: Object.fromEntries(cols.map((c, i) => [c.id, r[i]])) })) }
  }

  // ---------- folders & boards ----------
  const research = await api.createFolder({ name: 'Research' })
  const personal = await api.createFolder({ name: 'Personal' })
  await api.createWhiteboard({ name: 'Weekend trip', folderId: personal.id })
  const reading = await api.createWhiteboard({ name: 'Reading notes', folderId: personal.id })
  const market = await api.createWhiteboard({ name: 'Launch market 2026', folderId: research.id })
  const launch = await api.createWhiteboard({ name: 'Q4 launch plan' })
  const nimbus = await api.createWhiteboard({ name: 'Tech Startups — Nimbus Aerospace', folderId: research.id })

  // ================= main board: Nimbus Aerospace (fictional) =================
  const w = nimbus.id
  await heading(w, 0, 0, 'Nimbus Aerospace', 48, 560)
  await block(w, 4, 84, 'Reusable small-satellite launchers · Bremen · a fictional company for this example board', 560)

  const keyData = await block(
    w, 0, 180,
    '**Key data**\n\n- Founded: 2016\n- HQ: Bremen, Germany\n- Team: ~420 people\n- Vehicle: Nimbus-1, reusable first stage\n- Funding: €310m (Series C)',
    330, 'framed'
  )
  void keyData
  const ideas = await block(w, 0, 450, '**Ideas**\n\n- Rideshare marketplace for cubesats\n- Sell landing telemetry to insurers\n- Second launch site in northern Norway?', 330, 'framed')
  await tint(ideas, 'yellow')

  await api.addObject({
    whiteboardId: w, kind: 'chart', x: 390, y: 180, width: 800, height: 230,
    data: {
      chartType: 'timeline', title: 'Company history', columns: ['Date', 'Title', 'Detail'], options: {},
      rows: [
        ['2016-03-01', 'Founded', 'University spin-off'],
        ['2018-09-01', 'Engine test', 'First hot fire'],
        ['2020-06-01', 'Series B', '€85m raised'],
        ['2022-11-01', 'First orbit', 'Nimbus-1, flight 3'],
        ['2024-05-01', 'Booster landing', 'First stage recovered'],
        ['2025-10-01', 'Series C', '€180m raised']
      ]
    }
  })

  const revenue = await api.addObject({
    whiteboardId: w, kind: 'table', x: 390, y: 450, width: 290, height: 260,
    data: table('Revenue (€m)', [['Year'], ['Revenue', 'number']], [['2021', 4], ['2022', 11], ['2023', 26], ['2024', 48], ['2025', 83]])
  })
  const chart = await api.chartFromTable({ tableId: revenue.id, chartType: 'column' })
  await api.updateObjects([{ id: chart.id, x: 720, y: 450, width: 470, height: 260 }])

  // sketch of the technology (frameless ink) + its caption
  const bx = 1340
  await ink(w, [
    { points: poly([bx - 22, 500], [bx - 22, 262], [bx, 192], [bx + 22, 262], [bx + 22, 500], [bx - 22, 500]) },
    { points: loop(bx, 300, 9, 9, 2, 1.05) },
    { points: poly([bx - 22, 390], [bx + 22, 390]), width: 2.5 },
    { points: poly([bx - 22, 440], [bx - 48, 492], [bx - 48, 516], [bx - 22, 500]) },
    { points: poly([bx + 22, 440], [bx + 48, 492], [bx + 48, 516], [bx + 22, 500]) },
    { points: poly([bx - 28, 272], [bx - 40, 272]), width: 2.5 },
    { points: poly([bx + 28, 272], [bx + 40, 272]), width: 2.5 },
    { points: poly([bx - 12, 506], [bx - 4, 548], [bx + 2, 520], [bx + 10, 552], [bx + 14, 506]), color: ORANGE },
    { points: underline(bx - 110, bx + 110, 566, 4), width: 2.5 },
    ...arrow([bx + 120, 250], [bx + 50, 270], -16).map((points) => ({ points, color: BLUE, width: 2.5 }))
  ], 'booster')
  await block(w, bx + 96, 196, 'grid fins steer the descent', 150)
  await block(w, bx - 130, 590, '**Nimbus-1 booster**\n\nLands on four legs, flies again within three weeks.', 260)

  // pen annotations: underline the name, circle the 2025 bar, point at it
  await ink(w, [{ points: underline(0, 420, 74, 2), color: BLUE }], 'title')
  await ink(w, [
    { points: loop(1136, 560, 40, 88, 3), color: RED },
    ...arrow([1066, 772], [1118, 672], -22).map((points) => ({ points, color: RED }))
  ], 'bar')
  await block(w, 930, 760, '**+73%** vs. 2024', 150)

  // ================= smaller boards (for Home tiles) =================
  {
    const m = market.id
    await heading(m, 0, 0, 'Launch market 2026', 40, 520)
    await api.addObject({
      whiteboardId: m, kind: 'chart', x: 0, y: 90, width: 420, height: 320,
      data: { chartType: 'donut', title: 'Small-launch market share', columns: ['Label', 'Value'], options: {}, rows: [['Nimbus', '18'], ['Orbital Co.', '34'], ['Skyline', '22'], ['Others', '26']] }
    })
    await block(m, 460, 90, '**Takeaways**\n\n- Demand for dedicated rides keeps growing\n- Reuse is the price lever\n- Europe wants sovereign access', 320, 'framed')
    await block(m, 460, 300, 'Next: interview three cubesat operators about pricing.', 320)
    await ink(m, [{ points: loop(620, 180, 150, 34, 4), color: ORANGE, width: 2.5 }], 'm')
  }
  {
    const r = reading.id
    await heading(r, 0, 0, 'Reading notes', 40, 420)
    await block(r, 0, 80, '**How to Take Smart Notes**\n\nOne idea per note, link generously, write for your future self.', 300, 'framed')
    await block(r, 340, 80, '**Shape Up**\n\nFixed time, variable scope. Appetite over estimates.', 300, 'framed')
    await block(r, 0, 260, '**The Mom Test**\n\nAsk about their life, not your idea. Past behaviour beats opinions.', 300, 'framed')
    await ink(r, [{ points: underline(340, 600, 250, 5), color: BLUE }], 'r')
  }

  // ---------- card library, tags & tasks (for the "More" screenshots) ----------
  const me = await api.getActiveProfile()
  await api.updateProfile({ id: me.id, name: 'Alex Morgan', color: 'blue' })
  const maya = await api.createProfile({ name: 'Maya Chen', color: 'purple' })
  const jonas = await api.createProfile({ name: 'Jonas Weber', color: 'green' })
  const launchTag = await api.createTag({ name: 'Q4 launch', color: 'purple' })
  const researchTag = await api.createTag({ name: 'Research', color: 'blue' })
  const status = await api.createProperty({
    tagId: launchTag.id, name: 'Status', type: 'select',
    options: [
      { id: 'backlog', name: 'Backlog', color: 'gray' },
      { id: 'progress', name: 'In progress', color: 'blue' },
      { id: 'review', name: 'In review', color: 'orange' },
      { id: 'done', name: 'Done', color: 'green' }
    ]
  })
  const owner = await api.createProperty({ tagId: launchTag.id, name: 'Owner', type: 'text' })
  const card = async (title, markdown, tags, props = {}) => {
    const c = await api.createCard({ title, markdown, tagIds: tags.map((t) => t.id) })
    for (const [pid, v] of Object.entries(props)) await api.setPropertyValue(c.id, pid, v)
    return c
  }
  const goals = await card('Launch goals', '- 5,000 beta sign-ups by **Nov 15**\n- NPS above 50\n- 3 launch partners with public case studies', [launchTag], { [status.id]: 'progress', [owner.id]: 'Alex' })
  const messaging = await card('Messaging pillars', '1. Think visually\n2. Own your data\n3. Your AI, your tools', [launchTag], { [status.id]: 'review', [owner.id]: 'Maya' })
  const beta = await card('Beta rollout', 'Invite waves of 500 every Monday. Onboarding survey after day 3.', [launchTag], { [status.id]: 'progress', [owner.id]: 'Jonas' })
  const pricing = await card('Pricing page', 'Three tiers, annual toggle, FAQ on data ownership.', [launchTag], { [status.id]: 'backlog', [owner.id]: 'Maya' })
  const video = await card('Launch video', '90-second walkthrough. Script v3 approved.', [launchTag], { [status.id]: 'review', [owner.id]: 'Jonas' })
  await card('Press kit', 'Logo pack, product shots, fact sheet.', [launchTag], { [status.id]: 'backlog', [owner.id]: 'Alex' })
  await card('Onboarding flow', 'Welcome slides + guided tour. First board in under 2 minutes.', [launchTag], { [status.id]: 'done', [owner.id]: 'Maya' })
  await card('Partner outreach', 'Shortlist of 12 teams; 4 said yes to a pilot.', [launchTag], { [status.id]: 'done', [owner.id]: 'Alex' })
  const survey = await card('Pricing survey', '418 responses. Willingness to pay peaks at **$8–12 / month**.', [researchTag])
  await card('Interview synthesis', '12 interviews. Whiteboards beat docs for early thinking.', [researchTag])
  await card('Competitor scan', 'Speed, offline use and AI compared. Gap: local-first + open agent access.', [researchTag])

  const day = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10)
  const task = (text, cardId, extra) => api.addTask({ text, cardId, ...extra })
  await task('Finalize tagline with design', messaging.id, { priority: 'high', assigneeId: maya.id, dueDate: day(1), status: 'in_progress' })
  await task('Send beta wave 3 invites', beta.id, { priority: 'urgent', assigneeId: jonas.id, dueDate: day(0) })
  await task('Draft launch blog post', goals.id, { priority: 'medium', assigneeId: me.id, dueDate: day(3) })
  await task('Record voice-over', video.id, { priority: 'low', assigneeId: jonas.id, dueDate: day(6) })
  await task('Update pricing FAQ', pricing.id, { priority: 'high', assigneeId: maya.id, dueDate: day(-1) })
  await task('Summarize survey open answers', survey.id, { priority: 'none', assigneeId: me.id, dueDate: day(4), status: 'done' })

  // the Q4 launch board mixes library cards with blocks and a table
  {
    const l = launch.id
    await heading(l, 0, 0, 'Q4 launch plan', 40, 480)
    const place = (c, x, y) => api.addObject({ whiteboardId: l, kind: 'card', refId: c.id, x, y, width: 280, height: 200 })
    await place(goals, 0, 90)
    await place(messaging, 310, 90)
    await place(beta, 620, 90)
    await api.addObject({
      whiteboardId: l, kind: 'table', x: 0, y: 330, width: 420, height: 200,
      data: table('Beta sign-ups', [['Week'], ['Sign-ups', 'number']], [['W1', 420], ['W2', 610], ['W3', 880], ['W4', 1240]])
    })
    await block(l, 460, 340, 'Wave 3 goes out Monday — check the onboarding survey first.', 300)
  }

  return { board: nimbus.id }
})()

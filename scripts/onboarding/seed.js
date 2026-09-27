// Renderer-side demo seed for the onboarding screenshots (run as the first devShot step).
// Wipes the fresh scratch database and fills it with a realistic "product launch" workspace.
// Only ever run this against a scratch CANVASCL_DATA_DIR — see scripts/onboarding/shoot.mjs.
;(async () => {
  const api = window.api
  for (const b of await api.listWhiteboards()) await api.deleteWhiteboard(b.id)
  for (const c of await api.listCards({ limit: 500 })) await api.deleteCard(c.id)
  for (const t of await api.listTags()) await api.deleteTag(t.id)

  // ---------- people ----------
  const me = await api.getActiveProfile()
  await api.updateProfile({ id: me.id, name: 'Alex Morgan', color: 'blue' })
  const maya = await api.createProfile({ name: 'Maya Chen', color: 'purple' })
  const jonas = await api.createProfile({ name: 'Jonas Weber', color: 'green' })

  // ---------- tags & properties ----------
  const launch = await api.createTag({ name: 'Atlas v2', color: 'purple' })
  const research = await api.createTag({ name: 'Research', color: 'blue' })
  const reading = await api.createTag({ name: 'Reading', color: 'orange' })
  const status = await api.createProperty({
    tagId: launch.id,
    name: 'Status',
    type: 'select',
    options: [
      { id: 'backlog', name: 'Backlog', color: 'gray' },
      { id: 'progress', name: 'In progress', color: 'blue' },
      { id: 'review', name: 'In review', color: 'orange' },
      { id: 'done', name: 'Done', color: 'green' }
    ]
  })
  const owner = await api.createProperty({ tagId: launch.id, name: 'Owner', type: 'text' })
  const source = await api.createProperty({
    tagId: research.id,
    name: 'Source',
    type: 'select',
    options: [
      { id: 'interview', name: 'Interview', color: 'purple' },
      { id: 'survey', name: 'Survey', color: 'teal' },
      { id: 'desk', name: 'Desk research', color: 'yellow' }
    ]
  })

  const card = async (title, markdown, tags, props = {}) => {
    const c = await api.createCard({ title, markdown, tagIds: tags.map((t) => t.id) })
    for (const [pid, v] of Object.entries(props)) await api.setPropertyValue(c.id, pid, v)
    return c
  }

  // ---------- cards ----------
  const interviews = await card(
    'Interview synthesis',
    '12 interviews with design & research leads.\n\n- Teams lose context between tools\n- **Whiteboards** beat docs for early thinking\n- Everyone wants AI that can *act*, not just chat',
    [research],
    { [source.id]: 'interview' }
  )
  const competitors = await card(
    'Competitor scan',
    'Miro and Notion compared on speed, offline use and AI.\n\nGap: **local-first** + open agent access.',
    [research],
    { [source.id]: 'desk' }
  )
  const survey = await card(
    'Pricing survey',
    '418 responses. 64% prefer a one-time license; teams want per-seat.\n\nWillingness to pay peaks at **$8–12 / month**.',
    [research],
    { [source.id]: 'survey' }
  )
  const goals = await card(
    'Launch goals',
    '- 5,000 beta sign-ups by **Nov 15**\n- NPS above 50\n- 3 launch partners with public case studies',
    [launch],
    { [status.id]: 'progress', [owner.id]: 'Alex' }
  )
  const messaging = await card(
    'Messaging pillars',
    '1. Think visually\n2. Own your data\n3. Your AI, your tools\n\nTagline draft: *"A calm place for connected ideas."*',
    [launch],
    { [status.id]: 'review', [owner.id]: 'Maya' }
  )
  const beta = await card(
    'Beta rollout',
    'Invite waves of 500 every Monday. Onboarding survey after day 3, interviews after week 2.',
    [launch],
    { [status.id]: 'progress', [owner.id]: 'Jonas' }
  )
  const pricing = await card('Pricing page', 'Three tiers, annual toggle, FAQ on data ownership.', [launch], { [status.id]: 'backlog', [owner.id]: 'Maya' })
  const pressKit = await card('Press kit', 'Logo pack, 6 product shots, founder bio, fact sheet.', [launch], { [status.id]: 'backlog', [owner.id]: 'Alex' })
  const video = await card('Launch video', '90-second walkthrough. Script v3 approved, voice-over booked.', [launch], { [status.id]: 'review', [owner.id]: 'Jonas' })
  const onboarding = await card('Onboarding flow', 'Welcome slides + guided tour. Target: first board in under 2 minutes.', [launch], { [status.id]: 'done', [owner.id]: 'Maya' })
  const partners = await card('Partner outreach', 'Shortlist of 12 teams; 4 said yes to a pilot.', [launch], { [status.id]: 'done', [owner.id]: 'Alex' })
  await card('Changelog & docs', 'Migrate docs, write "What’s new in v2".', [launch], { [status.id]: 'backlog', [owner.id]: 'Jonas' })
  await card('How to Take Smart Notes', 'Sönke Ahrens — permanent notes, one idea per card, link generously.', [reading])
  await card('Building a Second Brain', 'Tiago Forte — CODE: capture, organize, distill, express.', [reading])
  await card('Shape Up', 'Ryan Singer — fixed time, variable scope; appetite over estimates.', [reading])
  await card('User needs map', 'Jobs to be done, ranked by frequency × pain.', [research], { [source.id]: 'interview' })

  // ---------- tasks ----------
  const day = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10)
  const task = (text, cardId, extra) => api.addTask({ text, cardId, ...extra })
  await task('Finalize tagline with design', messaging.id, { priority: 'high', assigneeId: maya.id, dueDate: day(1), status: 'in_progress' })
  await task('Send beta wave 3 invites', beta.id, { priority: 'urgent', assigneeId: jonas.id, dueDate: day(0) })
  await task('Draft launch blog post', goals.id, { priority: 'medium', assigneeId: me.id, dueDate: day(3) })
  await task('Book partner case-study calls', partners.id, { priority: 'medium', assigneeId: me.id, dueDate: day(2) })
  await task('Record voice-over', video.id, { priority: 'low', assigneeId: jonas.id, dueDate: day(6) })
  await task('Collect press quotes', pressKit.id, { priority: 'high', assigneeId: maya.id, dueDate: day(-1) })
  await task('Summarize survey open answers', survey.id, { priority: 'none', assigneeId: me.id, dueDate: day(4), status: 'done' })

  // ---------- folders & whiteboards ----------
  const projects = await api.createFolder({ name: 'Projects' })
  const researchFolder = await api.createFolder({ name: 'Research' })
  await api.createFolder({ name: 'Personal' })
  const board = await api.createWhiteboard({ name: 'Atlas v2 — Launch plan', folderId: projects.id })
  await api.createWhiteboard({ name: 'Q4 roadmap', folderId: projects.id })
  await api.createWhiteboard({ name: 'Customer interviews', folderId: researchFolder.id })
  await api.createWhiteboard({ name: 'Reading notes' })

  const w = board.id
  const obj = (o) => api.addObject({ whiteboardId: w, ...o })
  await obj({ kind: 'text', x: 0, y: -150, width: 760, height: 60, data: { text: 'Atlas v2 · Launch plan', size: 40 } })
  await obj({ kind: 'section', x: -30, y: -50, width: 690, height: 480, color: 'blue', data: { title: 'Research' } })
  await obj({ kind: 'section', x: 720, y: -50, width: 690, height: 480, color: 'purple', data: { title: 'Launch' } })
  const place = (c, x, y, w = 300) => obj({ kind: 'card', refId: c.id, x, y, width: w, height: 220 })
  const oInterviews = await place(interviews, 0, 10)
  const oCompetitors = await place(competitors, 330, 10)
  const oSurvey = await place(survey, 0, 235, 630)
  const oGoals = await place(goals, 750, 10)
  const oMessaging = await place(messaging, 1080, 10)
  const oBeta = await place(beta, 750, 235, 630)
  const chart = {
    chartType: 'column',
    title: 'Beta sign-ups per week',
    columns: ['Week', 'Sign-ups'],
    rows: [['W1', '420'], ['W2', '610'], ['W3', '880'], ['W4', '1240'], ['W5', '1530']],
    options: { legend: false }
  }
  await obj({ kind: 'chart', x: 1470, y: 10, width: 420, height: 300, data: chart })
  const link = (a, b, label) => api.addConnection({ whiteboardId: w, sourceId: a.id, targetId: b.id, label })
  await link(oInterviews, oGoals, 'informs')
  await link(oCompetitors, oMessaging)
  await link(oSurvey, oBeta, 'pricing test')
  await link(oGoals, oBeta)
  void onboarding

  return { board: board.id, launchTag: launch.id, researchTag: research.id }
})()

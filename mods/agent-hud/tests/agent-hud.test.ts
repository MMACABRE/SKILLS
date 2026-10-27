import { expect, test } from 'claude-code/testing'

test('renders agent list and usage bars in the hud pane', async ($, on) => {
  on('agent.list', () => ({
    value: [
      { id: 'a1', description: 'explore', type: 'Explore', status: 'running' },
      { id: 'a2', description: 'plan', type: 'Plan', status: 'completed' }
    ]
  }))
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: { window: 200000, percent: 10 },
      rateLimits: [
        { kind: 'five_hour', percentUsed: 42, resetsAt: '2026-01-01T00:00:00Z' },
        { kind: 'seven_day', percentUsed: 7, resetsAt: '2026-01-01T00:00:00Z' }
      ]
    }
  }))
  on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('clock.every', () => ({ value: undefined }))
  on('session.start', () => ({ cwd: '/tmp' }))

  await $.session.start({ cwd: '/tmp', surface: null, isInteractive: false })

  const ui = await $.ui.mount({
    plugin: 'agent-hud',
    surface: 'terminal',
    component: 'Pane',
    props: { title: 'Agent HUD', isFocused: false, bodyColumns: 40, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
    requestId: 'hud'
  })

  const text = JSON.stringify(await ui.find({}))
  expect(text).toContain('session')
  expect(text).toContain('weekly')
})

test('shows the reset date and time under each usage bar', async ($, on) => {
  const fiveReset = '2026-10-27T18:40:00Z'
  const sevenReset = '2026-11-02T09:05:00Z'
  on('agent.list', () => ({ value: [] }))
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: { window: 200000, percent: 10 },
      rateLimits: [
        { kind: 'five_hour', percentUsed: 42, resetsAt: fiveReset },
        { kind: 'seven_day', percentUsed: 7, resetsAt: sevenReset }
      ]
    }
  }))
  on('session.model', () => ({ value: 'claude-sonnet-5-5' }))

  const ui = await $.ui.mount({
    plugin: 'agent-hud',
    surface: 'terminal',
    component: 'Pane',
    props: { title: 'Agent HUD', isFocused: false, bodyColumns: 40, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
    requestId: 'hud'
  })

  // expected text is built the same local-time way the mod formats it
  const fmt = (iso: string) => {
    const d = new Date(iso)
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const pad = (n: number) => String(n).padStart(2, '0')
    return `resets ${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}, ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  const text = JSON.stringify(await ui.find({}))
  expect(text).toContain(fmt(fiveReset))
  expect(text).toContain(fmt(sevenReset))
})

test('omits the reset line when a window has no resetsAt', async ($, on) => {
  on('agent.list', () => ({ value: [] }))
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: { window: 200000, percent: 10 },
      rateLimits: [{ kind: 'five_hour', percentUsed: 42 }]
    }
  }))
  on('session.model', () => ({ value: 'claude-sonnet-5-5' }))

  const ui = await $.ui.mount({
    plugin: 'agent-hud',
    surface: 'terminal',
    component: 'Pane',
    props: { title: 'Agent HUD', isFocused: false, bodyColumns: 40, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
    requestId: 'hud'
  })

  const text = JSON.stringify(await ui.find({}))
  expect(text).toContain('session')
  expect(text).not.toContain('resets')
})

test('repaints the pane every 30 seconds', async ($, on) => {
  const periods: number[] = []
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('clock.every', (_$: unknown, e: { ms: number }) => {
    periods.push(e.ms)
    return { value: undefined }
  })
  on('session.start', () => ({ cwd: '/tmp' }))

  await $.session.start({ cwd: '/tmp', surface: null, isInteractive: false })

  expect(periods).toEqual([30000])
})

const SKILLS = [
  { name: 'help', description: 'Show help', source: 'builtin' },
  { name: 'zeta-tool', description: 'Last in the alphabet', source: 'user' },
  { name: 'debugging', description: 'Systematic root-cause debugging', source: 'user' },
  { name: 'alpha-skill', description: 'First in the alphabet', source: 'plugin', plugin: 'demo' }
]

function stubHud(on: any, extra: { stored?: unknown; fills?: unknown[]; stores?: unknown[] } = {}) {
  on('agent.list', () => ({ value: [] }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1, percent: 0 }, rateLimits: [] } }))
  on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
  on('command.list', () => ({ value: SKILLS }))
  on('store.get', () => ({ value: extra.stored }))
  on('store.set', (_$: unknown, e: unknown) => {
    extra.stores?.push(e)
    return { value: undefined }
  })
  on('prompt.fill', (_$: unknown, e: unknown) => {
    extra.fills?.push(e)
    return { isFilled: true }
  })
  on('prompt.read', () => ({ value: { text: '', cursor: 0 } }))
}

const mountHud = ($: any) =>
  $.ui.mount({
    plugin: 'agent-hud',
    surface: 'terminal',
    component: 'Pane',
    props: { title: 'Agent HUD', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
    requestId: 'hud'
  })

const skillOrder = async (ui: any) =>
  (await ui.findAll({ type: 'Button' }))
    .map((b: any) => b.key)
    .filter((k: string) => k?.startsWith('skill:'))
    .map((k: string) => k.slice('skill:'.length))

test('lists skills alphabetically, leaving out built-in commands', async ($, on) => {
  stubHud(on)
  const ui = await mountHud($)

  expect(await ui.find({ key: 'skill-search' })).toBeDefined()
  expect(await skillOrder(ui)).toEqual(['alpha-skill', 'debugging', 'zeta-tool'])
})

test('pressing a skill pastes its slash command into the prompt box', async ($, on) => {
  const fills: any[] = []
  stubHud(on, { fills })
  const ui = await mountHud($)

  await ui.press({ key: 'skill:debugging' })

  expect(fills).toHaveLength(1)
  expect(fills[0].text).toBe('/debugging ')
  expect(fills[0].mode).toBe('insert')
})

test('typing in the search box filters by name or description', async ($, on) => {
  stubHud(on)
  const ui = await mountHud($)

  await ui.input({ key: 'skill-search', text: 'ALPHABET', kind: 'change' })

  expect(await skillOrder(ui)).toEqual(['alpha-skill', 'zeta-tool'])
})

test('Enter in the search box pastes the top match', async ($, on) => {
  const fills: any[] = []
  stubHud(on, { fills })
  const ui = await mountHud($)

  await ui.input({ key: 'skill-search', text: 'root-cause' })

  expect(fills.map((f) => f.text)).toEqual(['/debugging '])
})

test('starring a skill moves it to the top and saves it', async ($, on) => {
  const stores: any[] = []
  stubHud(on, { stores })
  const ui = await mountHud($)

  await ui.press({ key: 'fav:zeta-tool' })

  expect(await skillOrder(ui)).toEqual(['zeta-tool', 'alpha-skill', 'debugging'])
  expect(stores.at(-1)).toEqual({ key: 'favourites', value: ['zeta-tool'] })

  await ui.press({ key: 'fav:zeta-tool' })

  expect(await skillOrder(ui)).toEqual(['alpha-skill', 'debugging', 'zeta-tool'])
  expect(stores.at(-1)).toEqual({ key: 'favourites', value: [] })
})

test('favourites saved in an earlier session come back at the top', async ($, on) => {
  stubHud(on, { stored: ['zeta-tool'] })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('clock.every', () => ({ value: undefined }))
  on('session.start', () => ({ cwd: '/tmp' }))

  await $.session.start({ cwd: '/tmp', surface: null, isInteractive: false })
  const ui = await mountHud($)

  expect(await skillOrder(ui)).toEqual(['zeta-tool', 'alpha-skill', 'debugging'])
})

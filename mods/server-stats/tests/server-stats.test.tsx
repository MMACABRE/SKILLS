import { expect, mock, test } from 'claude-code/testing'

const GiB = 1024 ** 3
// What the stats script prints on a real Ubuntu box
const STDOUT = [
  'cpu 183',
  `mem ${4 * GiB} ${2 * GiB}`,
  `disk ${80 * GiB} ${20 * GiB} ${60 * GiB}`,
  'ip 203.0.113.10',
  'host my-vps',
].join('\n')

const PANE = {
  plugin: 'server-stats',
  component: 'Pane',
  requestId: 'server-stats',
  props: {
    title: 'Server',
    isFocused: false,
    bodyColumns: 44,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 6 },
    view: {},
  },
} as const

test('the pane shows CPU, RAM, disk and IP from the script output', async ($, on) => {
  const clock = mock.clock(on)
  on('command.register', () => ({ value: { command: 'server-stats' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', () => ({
    value: { exitCode: 0, stdout: STDOUT, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /my-vps/ }))?.text).toContain('203.0.113.10')
  expect((await ui.find({ type: 'Text', text: /^CPU/ }))?.text).toContain('18.3%')
  expect((await ui.find({ type: 'Text', text: /^RAM/ }))?.text).toContain('50.0%  2.0/4.0 GB')
  expect((await ui.find({ type: 'Text', text: /^Disk/ }))?.text).toContain('25.0%  20.0/80.0 GB')
  await ui.unmount()
})

test('without Linux stats the pane says so instead of drawing zeros', async ($, on) => {
  const clock = mock.clock(on)
  on('command.register', () => ({ value: { command: 'server-stats' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', () => ({
    value: { exitCode: 1, stdout: '', stderr: 'no /proc', isStdoutTruncated: false, isStderrTruncated: false },
  }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text' }))?.text).toContain('could not read /proc')
  await ui.unmount()
})

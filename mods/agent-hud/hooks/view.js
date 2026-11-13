// The pane's drawing. `hudRows` turns plain data into rows, `drawPane` turns rows into elements.
//
// One rule keeps the terminal intact: a row is exactly one line and never wider than the pane,
// and there are never more rows than the pane has room for. A row that wraps, or a tree taller
// than its box, pushes the surrounding terminal out of place. Every row therefore goes through
// `fit`, and text that comes from outside (skill descriptions, agent names, git errors) goes
// through `plain` first.

import { isInSync } from './repo-sync.js'

const LABEL = 8 // the left column: 'session ', 'weekly  ', 'repo    '
const INDENT = ' '.repeat(LABEL)
const COMPACT_BELOW = 16 // rows; under this, separators and second lines go

// ---- text that fits ----

const ANSI = /\u001B(?:\[[0-?]*[ -\/]*[@-~]|\][^\u0007\u001B]*(?:\u0007|\u001B\\)?|[@-Z\\-_])/g
const CONTROL = /[\s\u0000-\u001F\u007F-\u009F]+/g // \s covers the line separators too
const ZERO_WIDTH = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFE00-\uFE0F\uFEFF]/g
// drawn two cells wide: CJK, Hangul, fullwidth forms, emoji
const WIDE = /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6\u{1F000}-\u{1FAFF}\u{20000}-\u{3FFFD}]/u

// One line of printable text: no escape codes, no control characters, no line breaks.
export function plain(text) {
  return String(text ?? '').replace(ANSI, '').replace(CONTROL, ' ').replace(ZERO_WIDTH, '').trim()
}

export function cells(text) {
  let n = 0
  for (const ch of text) n += WIDE.test(ch) ? 2 : 1
  return n
}

// At most `width` cells, ending in … when something was cut.
export function clip(text, width) {
  if (cells(text) <= width) return text
  let out = ''
  let used = 0
  for (const ch of text) {
    const w = WIDE.test(ch) ? 2 : 1
    if (used + w > width - 1) break
    out += ch
    used += w
  }
  return width > 0 ? out + '…' : ''
}

// ---- rows ----
// A row is { key, segments } or { key, input }. A segment is text with a style; one with
// `press` is a Button, and its `detail` is a dim tail inside the same Button.

const segmentCells = (seg) => cells(seg.text) + cells(seg.detail ?? '')

// The last line of defence: cut a row's segments, left to right, to the pane's width.
function fit(row, width) {
  if (!row.segments) return row
  const segments = []
  let room = width
  for (const seg of row.segments) {
    if (room <= 0) break
    const text = clip(seg.text, room)
    const detail = seg.detail === undefined ? undefined : clip(seg.detail, room - cells(text))
    const cut = { ...seg, text, detail: detail || undefined }
    segments.push(cut)
    room -= segmentCells(cut)
  }
  return { ...row, segments }
}

const dim = (text) => ({ text, dimColor: true })
const textRow = (key, text) => ({ key, segments: [dim(text)] })
const separator = (key, width) => textRow(key, '─'.repeat(width))

// ---- agents ----

const MODEL_GLYPHS = [
  [/opus/i, '◆'],
  [/sonnet/i, '●'],
  [/haiku/i, '▲'],
  [/fable/i, '★']
]

const STATUS_COLOR = {
  pending: 'gray',
  running: 'green',
  waiting: 'yellow',
  idle: 'cyan',
  completed: 'gray',
  failed: 'red',
  killed: 'red'
}

function glyphFor(model) {
  return MODEL_GLYPHS.find(([pattern]) => pattern.test(model ?? ''))?.[1] ?? '○'
}

// glyph, name, model, status; the model is the first thing to go when the pane is narrow
function agentRow({ key, label, model, status }, width) {
  const color = STATUS_COLOR[status] || 'white'
  const name = clip(plain(label), 18)
  const modelName = model ? plain(model).replace(/^claude-/, '') : 'model?'
  const head = [{ text: glyphFor(model), color, bold: true }, { text: ' ' + name }]
  const tail = { text: ' ' + status, color }
  const room = width - 1 - cells(name) - 1 - cells(tail.text) - 1
  const segments = room >= 4 ? [...head, dim(' ' + clip(modelName, room)), tail] : [...head, tail]
  return { key, segments }
}

function agentRows(main, agents, width, limit) {
  const rows = [agentRow({ key: 'main', label: 'main', ...main }, width)]
  if (agents.length === 0) return [...rows, textRow('none', 'no subagents running')]
  const shown = agents.length > limit ? agents.slice(0, limit - 1) : agents
  for (const a of shown) rows.push(agentRow({ key: a.id, label: a.name || a.type || a.id, ...a }, width))
  if (shown.length < agents.length) rows.push(textRow('more-agents', `+${agents.length - shown.length} more agents`))
  return rows
}

// ---- usage ----

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// "resets Tue 27 Oct, 22:10" in local time; undefined when there is no usable timestamp
function resetLabel(resetsAt) {
  if (!resetsAt) return undefined
  const d = new Date(resetsAt)
  if (Number.isNaN(d.getTime())) return undefined
  const pad = (n) => String(n).padStart(2, '0')
  return `resets ${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}, ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function usageColor(percent) {
  if (percent >= 90) return 'red'
  if (percent >= 70) return 'yellow'
  return 'green'
}

function usageRows(key, limit, width, isCompact) {
  const percent = Math.max(0, Math.min(100, Math.round(Number(limit.percentUsed) || 0)))
  const color = usageColor(percent)
  const barWidth = Math.max(4, Math.min(14, width - LABEL - 5)) // 5 = ' 100%'
  const filled = Math.round((percent / 100) * barWidth)
  const rows = [
    {
      key,
      segments: [
        dim(key.padEnd(LABEL)),
        { text: '█'.repeat(filled) + '░'.repeat(barWidth - filled), color },
        { text: ` ${percent}%`, color, bold: true }
      ]
    }
  ]
  const reset = isCompact ? undefined : resetLabel(limit.resetsAt)
  if (reset) rows.push(textRow(key + '-reset', INDENT + reset))
  return rows
}

function allUsageRows(rateLimits, width, isCompact) {
  const five = rateLimits.find((r) => r.kind === 'five_hour')
  const seven = rateLimits.find((r) => r.kind === 'seven_day')
  if (!five && !seven) return [textRow('no-usage', 'no rate-limit data yet')]
  return [
    ...(five ? usageRows('session', five, width, isCompact) : []),
    ...(seven ? usageRows('weekly', seven, width, isCompact) : [])
  ]
}

// ---- skills repo ----

function syncSummary(s) {
  if (s.status === 'idle' || (s.status === 'checking' && !s.checkedAt)) return ['gray', 'checking…']
  if (s.status === 'syncing') return ['yellow', 'syncing…']
  if (s.status === 'error') return ['red', '● ' + (plain(s.error) || 'failed')]
  if (isInSync(s)) return ['green', '● in sync']
  const parts = []
  if (s.changed.length) parts.push(`${s.changed.length} changed`)
  if (s.added.length) parts.push(`${s.added.length} new`)
  if (s.removed.length) parts.push(`${s.removed.length} removed`)
  if (s.ahead) parts.push(`${s.ahead} unpushed`)
  if (s.behind) parts.push(`${s.behind} behind`)
  return ['yellow', '● ' + parts.join(', ')]
}

function repoRows(s, width, isCompact, actions) {
  const [color, summary] = syncSummary(s)
  const isBusy = s.status === 'checking' || s.status === 'syncing'
  const canSync = !isBusy && !isInSync(s) && (s.status === 'out' || (s.status === 'error' && s.checkedAt))
  const buttons = []
  if (canSync) buttons.push({ text: 'sync ↑', press: 'repo-sync', onPress: actions.syncRepo, color: 'yellow' })
  if (!isBusy) buttons.push({ text: '↻', press: 'repo-check', onPress: actions.checkRepo, dimColor: true })
  // the buttons keep their room; the summary takes what is left
  const buttonCells = buttons.reduce((sum, b) => sum + 1 + cells(b.text), 0)
  const rows = [
    {
      key: 'repo',
      segments: [
        dim('repo'.padEnd(LABEL)),
        { text: clip(summary, Math.max(4, width - LABEL - buttonCells)), color },
        ...buttons.flatMap((b) => [{ text: ' ' }, b])
      ]
    }
  ]
  if (isCompact) return rows
  const names = [...s.changed.map((n) => '~' + n), ...s.added.map((n) => '+' + n), ...s.removed.map((n) => '-' + n)]
  if (names.length && s.status !== 'syncing') rows.push(textRow('repo-names', INDENT + plain(names.join(' '))))
  if (s.isOffline && s.status !== 'error') rows.push(textRow('repo-offline', INDENT + 'GitHub unreachable, local compare only'))
  return rows
}

// ---- skill finder ----

// Favourites first (in starring order), then the rest by name; the query matches name or description.
export function orderSkills(skills, query, favs) {
  const q = query.trim().toLowerCase()
  const matching = q
    ? skills.filter((s) => s.name.toLowerCase().includes(q) || (s.description || '').toLowerCase().includes(q))
    : skills
  const starred = favs.map((name) => matching.find((s) => s.name === name)).filter(Boolean)
  const rest = matching.filter((s) => !favs.includes(s.name)).sort((a, b) => a.name.localeCompare(b.name))
  return [...starred, ...rest]
}

function skillRow(skill, isFav, width, actions) {
  const name = clip(plain(skill.name), Math.max(1, width - 2)) // 2 = the star and a space
  return {
    key: 'row:' + skill.name,
    segments: [
      { text: isFav ? '★' : '☆', press: 'fav:' + skill.name, onPress: () => actions.toggleFavourite(skill.name), dimColor: !isFav },
      { text: ' ' },
      { text: name, detail: ' ' + plain(skill.description), press: 'skill:' + skill.name, onPress: () => actions.pasteSkill(skill.name) }
    ]
  }
}

// As many skills as `room` rows hold; the last row says how many were left out.
function skillRows(shown, query, favs, width, room, actions) {
  if (room <= 0) return []
  if (shown.length === 0) return [textRow('no-skills', query ? 'no skills match' : 'no skills found')]
  const visible = shown.length > room ? shown.slice(0, room - 1) : shown
  const rows = visible.map((skill) => skillRow(skill, favs.includes(skill.name), width, actions))
  if (visible.length < shown.length) rows.push(textRow('more-skills', `+${shown.length - visible.length} more, type to narrow`))
  return rows
}

// ---- the whole pane ----

/**
 * The HUD's rows for a pane of `size.columns` by `size.rows`, top to bottom: agents, usage,
 * skills repo, skill finder. The skill list takes whatever height the rest leaves.
 *
 * `hud` is plain data: { main: { model, status }, agents, rateLimits, sync, skills, query, favourites }.
 * `actions` are the handlers the buttons and the search box call.
 */
export function hudRows(hud, size, actions) {
  const width = Math.max(8, size.columns)
  const isCompact = size.rows < COMPACT_BELOW
  const between = (key) => (isCompact ? [] : [separator(key, width)])
  const shown = orderSkills(hud.skills, hud.query, hud.favourites)

  const top = [
    ...agentRows(hud.main, hud.agents, width, isCompact ? 2 : 6),
    ...between('sep'),
    ...allUsageRows(hud.rateLimits, width, isCompact),
    ...between('sep-repo'),
    ...repoRows(hud.sync, width, isCompact, actions),
    ...between('sep-skills'),
    {
      key: 'skill-search',
      input: {
        label: 'skills ',
        placeholder: 'search…',
        submitLabel: 'paste top',
        value: hud.query,
        onInput: actions.search,
        onSubmit: (value) => actions.submitSearch(value, hud.skills)
      }
    }
  ]
  const skills = skillRows(shown, hud.query, hud.favourites, width, size.rows - top.length, actions)
  return [...top, ...skills].map((row) => fit(row, width))
}

// A style prop is passed only when set: the surface refuses a prop it is handed as undefined.
function style({ color, dimColor, bold }) {
  return { ...(color && { color }), ...(dimColor && { dimColor }), ...(bold && { bold }) }
}

function drawSegment({ Text, Button }, seg) {
  if (!seg.press) return Text({ ...style(seg), wrap: 'truncate-end', children: [seg.text] })
  const button = { key: seg.press, plain: true, onPress: seg.onPress, ...style(seg) }
  if (!seg.detail) return Button({ ...button, label: seg.text })
  return Button({ ...button, children: [seg.text, Text({ dimColor: true, children: [seg.detail] })] })
}

// `elements` is what `$.ui.resolve(e)` returned.
export function drawPane(elements, rows) {
  const { Box, Input } = elements
  return Box({
    flexDirection: 'column',
    children: rows.map((row) =>
      row.input
        ? Input({ key: row.key, ...row.input })
        : Box({ key: row.key, flexDirection: 'row', children: row.segments.map((seg) => drawSegment(elements, seg)) })
    )
  })
}

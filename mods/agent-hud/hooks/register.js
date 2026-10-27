import { atom, read, update } from 'claude-code'

const PANE_ID = 'hud'
const SEARCH_KEY = 'skill-search'
const FAVOURITES_STORE_KEY = 'favourites'

const skillQuery = atom({ plugin: 'agent-hud', key: 'skillQuery' }, '')
const favourites = atom({ plugin: 'agent-hud', key: 'favourites' }, [])

// agentId -> model (lost on reload; repopulated as agents are (re-)spawned)
const agentModels = new Map()
let mainState = 'idle'

const SHAPE_RULES = [
  [/opus/i, '◆'], // ◆
  [/sonnet/i, '●'], // ●
  [/haiku/i, '▲'], // ▲
  [/fable/i, '★'] // ★
]

function shapeFor(model) {
  if (!model) return '○' // ○
  for (const [re, glyph] of SHAPE_RULES) if (re.test(model)) return glyph
  return '○'
}

function shortModel(model) {
  if (!model) return 'model?'
  return model.replace(/^claude-/, '')
}

const STATUS_COLOR = {
  pending: 'gray',
  running: 'green',
  waiting: 'yellow',
  idle: 'cyan',
  completed: 'gray',
  failed: 'red',
  killed: 'red'
}

function bar(percent, width) {
  const p = Math.max(0, Math.min(100, Math.round(percent)))
  const filled = Math.round((p / 100) * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

function barColor(percent) {
  if (percent >= 90) return 'red'
  if (percent >= 70) return 'yellow'
  return 'green'
}

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

function agentRow(Box, Text, key, shape, shapeColor, label, modelLabel, status) {
  return Box({
    key,
    flexDirection: 'row',
    gap: 1,
    children: [
      Text({ color: shapeColor, bold: true, children: [shape] }),
      Text({ children: [label] }),
      Text({ dimColor: true, children: [modelLabel] }),
      Text({ color: shapeColor, children: [status] })
    ]
  })
}

function usageRow(Box, Text, key, label, limit) {
  const percent = limit.percentUsed
  const color = barColor(percent)
  const barLine = Box({
    key: key + '-bar',
    flexDirection: 'row',
    gap: 1,
    children: [
      Text({ dimColor: true, children: [label] }),
      Text({ color, children: [bar(percent, 14)] }),
      Text({ color, bold: true, children: [percent.toFixed(0) + '%'] })
    ]
  })
  const reset = resetLabel(limit.resetsAt)
  if (!reset) return Box({ key, flexDirection: 'column', children: [barLine] })
  // indented past the 7-char label + gap so it sits under the bar
  const resetLine = Text({ key: key + '-reset', dimColor: true, children: [' '.repeat(8) + reset] })
  return Box({ key, flexDirection: 'column', children: [barLine, resetLine] })
}

// Skills are the slash commands that are not built into Claude Code: the user's own and plugins'.
// A failing listing leaves the finder empty rather than taking the whole HUD down.
async function listSkills($) {
  try {
    const commands = await $.command.list()
    return commands.filter((c) => c.source === 'user' || c.source === 'plugin')
  } catch {
    return []
  }
}

// Favourites first (in starring order), then the rest by name; the query matches name or description.
function orderSkills(skills, query, favs) {
  const q = query.trim().toLowerCase()
  const matching = q
    ? skills.filter((s) => s.name.toLowerCase().includes(q) || (s.description || '').toLowerCase().includes(q))
    : skills
  const starred = favs.map((name) => matching.find((s) => s.name === name)).filter(Boolean)
  const rest = matching.filter((s) => !favs.includes(s.name)).sort((a, b) => a.name.localeCompare(b.name))
  return [...starred, ...rest]
}

function pasteSkill($, name) {
  return $.prompt.fill({ text: `/${name} `, mode: 'insert' })
}

async function toggleFavourite($, name) {
  const next = await update($, favourites, (list = []) =>
    list.includes(name) ? list.filter((n) => n !== name) : [...list, name]
  )
  await $.store.set(FAVOURITES_STORE_KEY, next)
}

function skillRow(Box, Text, Button, $, skill, isFav, width) {
  const room = Math.max(0, width - skill.name.length - 5)
  const desc = (skill.description || '').replace(/\s+/g, ' ')
  const shortDesc = desc.length > room ? desc.slice(0, Math.max(0, room - 1)) + '…' : desc
  return Box({
    key: 'row:' + skill.name,
    flexDirection: 'row',
    gap: 1,
    children: [
      Button({
        key: 'fav:' + skill.name,
        plain: true,
        dimColor: !isFav,
        label: isFav ? '★' : '☆',
        onPress: () => toggleFavourite($, skill.name)
      }),
      Button({
        key: 'skill:' + skill.name,
        plain: true,
        onPress: () => pasteSkill($, skill.name),
        children: [skill.name + ' ', Text({ dimColor: true, children: [shortDesc] })]
      })
    ]
  })
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    try {
      const stored = await $.store.get(FAVOURITES_STORE_KEY)
      if (Array.isArray(stored)) {
        const names = stored.filter((n) => typeof n === 'string')
        await update($, favourites, () => names)
      }
    } catch {
      // unreadable favourites must not stop the HUD from opening; starring again rewrites them
    }
    await $.ui.open({ id: PANE_ID, title: 'Agent HUD', rows: 30 })
    $.clock.every(30000, () => $.ui.invalidate('ui.render'))
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    try {
      if (result.agentId) agentModels.set(result.agentId, result.model)
      $.ui.invalidate('ui.render')
    } catch {
      // never let bookkeeping after a successful spawn fail the spawn itself
    }
    return result
  })

  on('turn.start', async ($, e, next) => {
    mainState = 'running'
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    mainState = 'idle'
    return next(e)
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE_ID) return next(e)
    const { Box, Text, Button, Input } = $.ui.resolve(e)

    const [agents, usage, mainModel, skills, query, favs] = await Promise.all([
      $.agent.list(),
      $.session.usage(),
      $.session.model(),
      listSkills($),
      read($, skillQuery),
      read($, favourites)
    ])

    const rows = []

    rows.push(
      agentRow(
        Box,
        Text,
        'main',
        shapeFor(mainModel),
        mainState === 'running' ? 'green' : 'cyan',
        'main',
        shortModel(mainModel),
        mainState
      )
    )

    if (agents.length === 0) {
      rows.push(Text({ key: 'none', dimColor: true, children: ['no subagents running'] }))
    } else {
      for (const a of agents) {
        const model = agentModels.get(a.id)
        rows.push(
          agentRow(
            Box,
            Text,
            a.id,
            shapeFor(model),
            STATUS_COLOR[a.status] || 'white',
            (a.name || a.type || a.id).slice(0, 18),
            shortModel(model),
            a.status
          )
        )
      }
    }

    rows.push(Box({ key: 'sep', children: [Text({ dimColor: true, children: ['─'.repeat(28)] })] }))

    const five = usage.rateLimits.find((r) => r.kind === 'five_hour')
    const seven = usage.rateLimits.find((r) => r.kind === 'seven_day')

    if (five) rows.push(usageRow(Box, Text, 'session', 'session', five))
    if (seven) rows.push(usageRow(Box, Text, 'weekly', 'weekly ', seven))
    if (!five && !seven) {
      rows.push(Text({ key: 'no-usage', dimColor: true, children: ['no rate-limit data yet'] }))
    }

    const width = e.props?.bodyColumns ?? 40
    const shown = orderSkills(skills, query, favs)
    rows.push(Box({ key: 'sep-skills', children: [Text({ dimColor: true, children: ['─'.repeat(28)] })] }))
    rows.push(
      Input({
        key: SEARCH_KEY,
        label: 'skills ',
        placeholder: 'search…',
        submitLabel: 'paste top',
        value: query,
        onInput: (value) => update($, skillQuery, () => value),
        onSubmit: async (value) => {
          await update($, skillQuery, () => value)
          const top = orderSkills(skills, value, await read($, favourites))[0]
          if (top) await pasteSkill($, top.name)
        }
      })
    )
    if (shown.length === 0) {
      rows.push(Text({ key: 'no-skills', dimColor: true, children: [query ? 'no skills match' : 'no skills found'] }))
    }
    // rows left in the pane after what is drawn above; keep at least a few skills visible
    const room = Math.max(5, (e.viewport?.rows ?? 30) - rows.length - 2)
    for (const skill of shown.slice(0, room)) {
      rows.push(skillRow(Box, Text, Button, $, skill, favs.includes(skill.name), width))
    }
    if (shown.length > room) {
      rows.push(Text({ key: 'more-skills', dimColor: true, children: [`+${shown.length - room} more, keep typing to narrow`] }))
    }

    return Box({ flexDirection: 'column', children: rows })
  })
}

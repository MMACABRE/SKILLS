// agent-hud: a pane showing the main session and its subagents, the usage bars, the
// skills-repo row and a skill finder. This file wires events to state and state to the pane:
//   repo-sync.js  the skills-repo check and sync, and its result
//   view.js       data -> rows -> elements
import { atom, read, update } from 'claude-code'

import { readRepoSync, runRepoSync } from './repo-sync.js'
import { drawPane, hudRows, orderSkills } from './view.js'

// What the pane draws from lives in `$.state`: a write redraws the pane by itself and the
// values survive a hot reload. Each key is declared in ../types/index.d.ts, and an atom is
// declared in the file that reads or writes it (the engine lists a module's state that way).
const skillQuery = atom({ plugin: 'agent-hud', key: 'skillQuery' }, '')
const favourites = atom({ plugin: 'agent-hud', key: 'favourites' }, [])
const mainStatus = atom({ plugin: 'agent-hud', key: 'mainStatus' }, 'idle')
// agentId -> model, recorded at spawn: `$.agent.list()` does not carry the model
const agentModels = atom({ plugin: 'agent-hud', key: 'agentModels' }, {})

const PANE_ID = 'hud'
const PANE_TITLE = 'Agent HUD'
// Asked for where the pane sits inline above the prompt; the dock ignores it. Kept well under a
// screen so the pane never crowds the conversation out.
const PANE_ROWS = 20
const FAVOURITES_STORE_KEY = 'favourites'
const REPAINT_MS = 30 * 1000 // agent statuses and usage have no change event
const REPO_CHECK_MS = 5 * 60 * 1000
const MAX_AGENT_MODELS = 64

// The HUD is an extra: nothing it does may fail the event it rides on, or blank the pane.
const soft = (promise, fallback) => Promise.resolve(promise).catch(() => fallback)

const openPane = ($) => $.ui.open({ id: PANE_ID, title: PANE_TITLE, rows: PANE_ROWS })

// Skills are the slash commands that are not built into Claude Code: the user's own and plugins'.
async function listSkills($) {
  const commands = await $.command.list()
  return commands.filter((c) => c.source === 'user' || c.source === 'plugin')
}

const pasteSkill = ($, name) => $.prompt.fill({ text: `/${name} `, mode: 'insert' })

async function toggleFavourite($, name) {
  const next = await update($, favourites, (list = []) =>
    list.includes(name) ? list.filter((n) => n !== name) : [...list, name]
  )
  await $.store.set(FAVOURITES_STORE_KEY, next)
}

async function loadFavourites($) {
  const stored = await $.store.get(FAVOURITES_STORE_KEY)
  if (!Array.isArray(stored)) return
  await update($, favourites, () => stored.filter((n) => typeof n === 'string'))
}

async function startHud($) {
  // each step alone: unreadable favourites or a refused command must not keep the pane shut
  await soft(loadFavourites($))
  await soft($.command.register({ name: 'hud', description: 'Open the Agent HUD pane' }))
  await soft(openPane($))
  $.clock.every(REPAINT_MS, () => $.ui.invalidate('ui.render'))
  $.clock.every(REPO_CHECK_MS, () => runRepoSync($, 'check'))
  // first check in the background, so the pane opens without waiting on git
  runRepoSync($, 'check')
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    // a `-p` run or the SDK draws nowhere: no pane, no timers, no git fetch
    if (e.isInteractive) await soft(startHud($))
    return next(e)
  })

  on('command.run', { command: 'hud' }, async ($) => {
    await openPane($)
    return { text: 'Agent HUD opened.' }
  })

  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    if (result.agentId) {
      await soft(
        update($, agentModels, (models = {}) =>
          Object.fromEntries([...Object.entries(models), [result.agentId, result.model]].slice(-MAX_AGENT_MODELS))
        )
      )
    }
    return result
  })

  on('turn.start', async ($, e, next) => {
    await soft(update($, mainStatus, () => 'running'))
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    await soft(update($, mainStatus, () => 'idle'))
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE_ID }, async ($, e) => {
    // one failing source leaves its section empty, never the pane
    const [agents, usage, model, skills, query, favs, sync, status, models] = await Promise.all([
      soft($.agent.list(), []),
      soft($.session.usage(), undefined),
      soft($.session.model(), undefined),
      soft(listSkills($), []),
      read($, skillQuery),
      read($, favourites),
      readRepoSync($),
      read($, mainStatus),
      read($, agentModels)
    ])

    const hud = {
      main: { model, status },
      agents: agents.map((a) => ({ ...a, model: models[a.id] })),
      rateLimits: usage?.rateLimits ?? [],
      sync,
      skills,
      query,
      favourites: favs
    }
    // the pane's own box, not the screen: `viewport.rows` counts the whole terminal
    const size = { columns: e.props.bodyColumns, rows: e.props.scroll.bodyRows || PANE_ROWS }
    const actions = {
      toggleFavourite: (name) => toggleFavourite($, name),
      pasteSkill: (name) => pasteSkill($, name),
      syncRepo: () => runRepoSync($, 'sync'),
      checkRepo: () => runRepoSync($, 'check'),
      search: (value) => update($, skillQuery, () => value),
      submitSearch: async (value, listed) => {
        await update($, skillQuery, () => value)
        const top = orderSkills(listed, value, await read($, favourites))[0]
        if (top) await pasteSkill($, top.name)
      }
    }
    return drawPane($.ui.resolve(e), hudRows(hud, size, actions))
  })
}

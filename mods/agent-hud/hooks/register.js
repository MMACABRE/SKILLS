import { atom, read, update } from 'claude-code'

const PANE_ID = 'hud'
const SEARCH_KEY = 'skill-search'
const FAVOURITES_STORE_KEY = 'favourites'

const skillQuery = atom({ plugin: 'agent-hud', key: 'skillQuery' }, '')
const favourites = atom({ plugin: 'agent-hud', key: 'favourites' }, [])

const REPO_CHECK_MS = 5 * 60 * 1000
const EMPTY_SYNC = { status: 'idle', changed: [], added: [], removed: [], ahead: 0, behind: 0, isOffline: false }
const repoSync = atom({ plugin: 'agent-hud', key: 'repoSync' }, EMPTY_SYNC)

const SYNC_SCRIPT = `# skills-sync: compare ~/.agents/skills with the SKILLS repo clone, or mirror it there and push.
# Usage: bash -s -- check|sync   (the script arrives on stdin)
# Prints tagged lines: CHANGED/ADDED/REMOVED <names>, AHEAD/BEHIND/DIRTY <n>, OFFLINE, SYNCED <sha|none> <count>, ERROR <text>
set -u
LOCAL="\${SKILLS_LOCAL:-$HOME/.agents/skills}"
REPO="\${SKILLS_REPO:-$HOME/Documents/GitHub/SKILLS}"
MODE="\${1:-check}"
EXCL=(-x __pycache__ -x '*.pyc' -x .git -x node_modules -x .DS_Store)

[ -d "$LOCAL" ] || { echo "ERROR no skills folder at $LOCAL"; exit 0; }
git -C "$REPO" rev-parse --git-dir >/dev/null 2>&1 || { echo "ERROR not a git repo: $REPO"; exit 0; }

# skill folders = top-level dirs holding a SKILL.md (mods/ and dot-dirs never match)
names() { for d in "$1"/*/; do [ -f "$d/SKILL.md" ] && basename "$d"; done; }

compare() {
  CHANGED=(); ADDED=(); REMOVED=()
  while IFS= read -r n; do
    [ -n "$n" ] || continue
    if [ ! -d "$REPO/$n" ]; then ADDED+=("$n")
    elif [ ! -d "$LOCAL/$n" ]; then REMOVED+=("$n")
    elif ! diff -rq --strip-trailing-cr "\${EXCL[@]}" "$LOCAL/$n" "$REPO/$n" >/dev/null 2>&1; then CHANGED+=("$n")
    fi
  done < <({ names "$LOCAL"; names "$REPO"; } | sort -u)
}

remote() {
  AHEAD=0; BEHIND=0; OFFLINE=0
  timeout 20 git -C "$REPO" fetch -q origin 2>/dev/null || OFFLINE=1
  local counts
  counts=$(git -C "$REPO" rev-list --left-right --count 'HEAD...@{u}' 2>/dev/null) || return 0
  set -- $counts
  AHEAD=$1; BEHIND=$2
}

dirty() { git -C "$REPO" status --porcelain | wc -l | tr -d ' '; }

report() {
  compare
  echo "CHANGED \${CHANGED[*]:-}"
  echo "ADDED \${ADDED[*]:-}"
  echo "REMOVED \${REMOVED[*]:-}"
  echo "AHEAD $AHEAD"
  echo "BEHIND $BEHIND"
  echo "DIRTY $(dirty)"
  [ "$OFFLINE" = 1 ] && echo "OFFLINE"
  return 0
}

if [ "$MODE" = check ]; then remote; report; exit 0; fi
[ "$MODE" = sync ] || { echo "ERROR unknown mode: $MODE"; exit 0; }

# hsdevloop carries copies of the skills it uses; refresh them before syncing
if [ -f "$LOCAL/hsdevloop/scripts/bundle.sh" ]; then
  bash "$LOCAL/hsdevloop/scripts/bundle.sh" refresh >/dev/null 2>&1 || echo "WARN hsdevloop bundle refresh failed"
fi

remote
if [ "$OFFLINE" = 1 ]; then echo "ERROR cannot reach GitHub, nothing synced"; report; exit 0; fi
if [ "$BEHIND" -gt 0 ]; then
  if [ "$(dirty)" -gt 0 ]; then echo "ERROR repo is behind GitHub and has uncommitted edits; pull it first"; report; exit 0; fi
  git -C "$REPO" pull -q --ff-only || { echo "ERROR pull failed"; report; exit 0; }
  remote
fi

compare
PATHS=("\${CHANGED[@]}" "\${ADDED[@]}" "\${REMOVED[@]}")
if [ \${#PATHS[@]} -gt 0 ]; then
  for n in "\${CHANGED[@]}" "\${ADDED[@]}"; do
    rm -rf "\${REPO:?}/$n"
    cp -rL "$LOCAL/$n" "$REPO/$n"
    find "$REPO/$n" '(' -name __pycache__ -o -name node_modules -o -name .git ')' -prune -exec rm -rf {} + 2>/dev/null
    find "$REPO/$n" '(' -name '*.pyc' -o -name .DS_Store ')' -delete 2>/dev/null
  done
  for n in "\${REMOVED[@]}"; do rm -rf "\${REPO:?}/$n"; done
  git -C "$REPO" add -A -- "\${PATHS[@]}"
  if ! git -C "$REPO" diff --cached --quiet -- "\${PATHS[@]}"; then
    body="changed: \${CHANGED[*]:-none}
added: \${ADDED[*]:-none}
removed: \${REMOVED[*]:-none}"
    git -C "$REPO" commit -q -m "chore: sync skills from $(hostname)" -m "$body" -- "\${PATHS[@]}" \\
      || { echo "ERROR commit failed"; remote; report; exit 0; }
  fi
fi

remote
if [ "$AHEAD" -gt 0 ]; then
  # push to the branch this one tracks (origin/main), whatever the local branch is called
  up=$(git -C "$REPO" rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null) \\
    || { echo "ERROR the repo branch tracks no GitHub branch"; report; exit 0; }
  out=$(git -C "$REPO" push -q "\${up%%/*}" "HEAD:\${up#*/}" 2>&1) \\
    || { echo "ERROR push failed: $(echo "$out" | tail -1)"; remote; report; exit 0; }
  remote
  [ "$AHEAD" -gt 0 ] && { echo "ERROR push did not reach $up"; report; exit 0; }
  echo "SYNCED $(git -C "$REPO" rev-parse --short HEAD) \${#PATHS[@]}"
else
  echo "SYNCED none 0"
fi
remote
report
`

// Git Bash, found from git's own install: on Windows the `bash` on PATH is WSL, which
// sees different paths. Falls back to the system bash elsewhere. Cached once found.
let bashPath
async function findBash($) {
  if (bashPath) return bashPath
  const candidates = []
  try {
    const { stdout } = await $.process.run(['git', '--exec-path'], { timeoutMs: 10000 })
    const execPath = stdout.trim().replace(/\\/g, '/')
    const root = execPath.replace(/\/(mingw64|mingw32|clangarm64)?\/?libexec\/git-core$/i, '')
    if (root && root !== execPath) candidates.push(root + '/bin/bash.exe', root + '/usr/bin/bash.exe')
  } catch {
    // no git on PATH; try the usual places below
  }
  candidates.push('C:/Program Files/Git/bin/bash.exe', '/bin/bash', 'bash')
  for (const candidate of candidates) {
    try {
      const r = await $.process.run([candidate, '-c', 'echo ok'], { timeoutMs: 10000 })
      if (r.exitCode === 0 && r.stdout.trim() === 'ok') return (bashPath = candidate)
    } catch {
      // not there; next one
    }
  }
  return undefined
}

// The script's tagged lines -> the repoSync value (status filled in by the caller).
function parseSyncOutput(stdout) {
  const out = { changed: [], added: [], removed: [], ahead: 0, behind: 0, isOffline: false }
  for (const line of stdout.split(/\r?\n/)) {
    const [tag, ...rest] = line.trim().split(/\s+/)
    const words = rest.filter(Boolean)
    if (tag === 'CHANGED') out.changed = words
    else if (tag === 'ADDED') out.added = words
    else if (tag === 'REMOVED') out.removed = words
    else if (tag === 'AHEAD') out.ahead = Number(words[0]) || 0
    else if (tag === 'BEHIND') out.behind = Number(words[0]) || 0
    else if (tag === 'OFFLINE') out.isOffline = true
    else if (tag === 'SYNCED') out.syncedSha = words[0]
    else if (tag === 'ERROR' && !out.error) out.error = words.join(' ')
  }
  return out
}

function isInSync(s) {
  return s.changed.length + s.added.length + s.removed.length + s.ahead + s.behind === 0
}

// mode 'check' compares ~/.agents/skills with the SKILLS clone; 'sync' mirrors it there and pushes.
// Never throws: any failure lands in the row as an error so the rest of the HUD keeps drawing.
let isRunning = false
async function runRepoSync($, mode) {
  if (isRunning) return
  isRunning = true
  try {
    await update($, repoSync, (s = EMPTY_SYNC) => ({ ...s, status: mode === 'sync' ? 'syncing' : 'checking' }))
    let next
    try {
      const bash = await findBash($)
      if (!bash) {
        next = { ...EMPTY_SYNC, status: 'error', error: 'Git Bash not found' }
      } else {
        const r = await $.process.run([bash, '-s', '--', mode], {
          stdin: SYNC_SCRIPT,
          timeoutMs: mode === 'sync' ? 300000 : 60000
        })
        const parsed = parseSyncOutput(r.stdout)
        if (!parsed.error && r.exitCode !== 0) parsed.error = (r.stderr.trim().split('\n').pop() || 'exit ' + r.exitCode)
        next = { ...parsed, status: parsed.error ? 'error' : isInSync(parsed) ? 'ok' : 'out', checkedAt: Date.now() }
      }
    } catch (err) {
      next = { ...EMPTY_SYNC, status: 'error', error: String(err?.message || err).split('\n')[0] }
    }
    await update($, repoSync, () => next)
    if (mode === 'sync' && next.syncedSha && next.syncedSha !== 'none') {
      try {
        await $.ui.toast(`skills pushed to the repo (${next.syncedSha})`)
      } catch {
        // a missing toast is cosmetic
      }
    }
  } catch {
    // state writes failing must not surface as an unhandled rejection
  } finally {
    isRunning = false
  }
}

function syncSummary(s) {
  if (s.status === 'idle' || (s.status === 'checking' && !s.checkedAt)) return ['gray', 'checking…']
  if (s.status === 'syncing') return ['yellow', 'syncing…']
  if (s.status === 'error') return ['red', '● ' + (s.error || 'failed')]
  if (isInSync(s)) return ['green', '● in sync']
  const parts = []
  if (s.changed.length) parts.push(`${s.changed.length} changed`)
  if (s.added.length) parts.push(`${s.added.length} new`)
  if (s.removed.length) parts.push(`${s.removed.length} removed`)
  if (s.ahead) parts.push(`${s.ahead} unpushed`)
  if (s.behind) parts.push(`${s.behind} behind`)
  return ['yellow', '● ' + parts.join(', ')]
}

function clip(text, width) {
  return text.length > width ? text.slice(0, Math.max(0, width - 1)) + '…' : text
}

function repoRows(Box, Text, Button, $, s, width) {
  const [color, summary] = syncSummary(s)
  const isBusy = s.status === 'checking' || s.status === 'syncing'
  const canSync = !isBusy && (s.status === 'out' || (s.status === 'error' && s.checkedAt))
  const children = [
    Text({ dimColor: true, children: ['repo   '] }),
    Text({ color, children: [clip(summary, Math.max(8, width - 20))] })
  ]
  if (canSync && !isInSync(s)) {
    children.push(Button({ key: 'repo-sync', plain: true, color: 'yellow', label: 'sync ↑', onPress: () => runRepoSync($, 'sync') }))
  }
  if (!isBusy) {
    children.push(Button({ key: 'repo-check', plain: true, dimColor: true, label: '↻', onPress: () => runRepoSync($, 'check') }))
  }
  const rows = [Box({ key: 'repo', flexDirection: 'row', gap: 1, children })]
  const names = [...s.changed.map((n) => '~' + n), ...s.added.map((n) => '+' + n), ...s.removed.map((n) => '-' + n)]
  if (names.length && s.status !== 'syncing') {
    rows.push(Text({ key: 'repo-names', dimColor: true, children: [' '.repeat(8) + clip(names.join(' '), Math.max(8, width - 8))] }))
  }
  if (s.isOffline && s.status !== 'error') {
    rows.push(Text({ key: 'repo-offline', dimColor: true, children: [' '.repeat(8) + 'GitHub unreachable, local compare only'] }))
  }
  return rows
}

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
    $.clock.every(REPO_CHECK_MS, () => runRepoSync($, 'check'))
    // first check in the background, so the pane opens without waiting on git
    runRepoSync($, 'check')
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

    const [agents, usage, mainModel, skills, query, favs, sync] = await Promise.all([
      $.agent.list(),
      $.session.usage(),
      $.session.model(),
      listSkills($),
      read($, skillQuery),
      read($, favourites),
      read($, repoSync)
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

    rows.push(Box({ key: 'sep-repo', children: [Text({ dimColor: true, children: ['─'.repeat(28)] })] }))
    rows.push(...repoRows(Box, Text, Button, $, { ...EMPTY_SYNC, ...sync }, width))

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

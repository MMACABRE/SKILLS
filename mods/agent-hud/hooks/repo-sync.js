// The skills-repo row's work: compare ~/.agents/skills with the SKILLS clone, or mirror it
// there and push. The interface is `runRepoSync($, mode)` to do the work and
// `readRepoSync($)` for its last result, which this module alone keeps in `$.state`.
import { atom, read, update } from 'claude-code'

const EMPTY_SYNC = { status: 'idle', changed: [], added: [], removed: [], ahead: 0, behind: 0, isOffline: false }
const repoSync = atom({ plugin: 'agent-hud', key: 'repoSync' }, EMPTY_SYNC)

// The last check or sync, always a whole value: what an older version stored may lack fields.
export async function readRepoSync($) {
  return { ...EMPTY_SYNC, ...(await read($, repoSync)) }
}

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

export function isInSync(s) {
  return s.changed.length + s.added.length + s.removed.length + s.ahead + s.behind === 0
}

// mode 'check' compares ~/.agents/skills with the SKILLS clone; 'sync' mirrors it there and pushes.
// Never throws: any failure lands in the row as an error so the rest of the HUD keeps drawing.
let isRunning = false
export async function runRepoSync($, mode) {
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

# agent-hud

A Claude Code plugin (mod) that opens a small terminal pane showing:
- the main session + any running subagents, each with a model glyph and status
- two usage bars: 5-hour session limit and 7-day weekly limit, each with its reset time
- a skill finder: search box, click a skill to paste `/name ` into the prompt, ☆/★ to favourite

Installed from this directory as `agent-hud@hossein-mods` (local marketplace), scope: user.

## Files

- `.claude-plugin/plugin.json` — plugin metadata (name, version, description, author).
- `.claude-plugin/marketplace.json` — registers this directory as a local marketplace
  (`hossein-mods`) with one plugin (`agent-hud`, source `./`). This is what lets
  `claude plugin install`/`list` find it from a plain folder instead of a real registry.
- `.claude-plugin/types/` — vendored `.d.ts` files for the mod APIs (`claude-code`,
  `claude-code-mcp`, `claude-code-tools`). Not shipped logic — just editor/tsc types.
  **This is the source of truth for what hook payloads and `$.*` calls actually look like.**
  When a field seems wrong at runtime, check here before guessing.
- `hooks/hooks.json` — tells the plugin loader which JS files register hooks
  (`modules: ["./register.js"]`).
- `hooks/register.js` — all the actual logic. One file, no build step.
- `tests/agent-hud.test.ts` — one test using `claude-code/testing`'s mock harness.
- `tsconfig.json` — just extends the vendored types' tsconfig for editor support.

## How register.js works

Exports one function: `register(on)`. `on(eventName, handler)` subscribes a hook.
Every handler gets `($, e, next)`:
- `$` — the API surface (`$.ui`, `$.agent`, `$.session`, `$.clock`, ...)
- `e` — the event payload
- `next(e)` — calls the next hook in the chain / the engine's default behavior;
  you must call and usually return this unless you're intentionally short-circuiting.

Hooks registered:

| Event | What it does |
|---|---|
| `session.start` | Opens the HUD pane (`$.ui.open`), starts a 30s repaint timer and a 5 min skills-repo check (`$.clock.every`), kicks off the first check in the background |
| `agent.spawn` | After a subagent spawns, records its model in `agentModels` (a `Map<agentId, model>`) so the pane can show the right glyph later. Wrapped in try/catch so bookkeeping can never fail the actual spawn. |
| `turn.start` / `turn.complete` | Tracks `mainState` ('running'/'idle') for the main session's own row. |
| `ui.render` (component: `Pane`) | The actual render function. Only acts when `e.requestId === PANE_ID`; otherwise defers to `next(e)`. Pulls `$.agent.list()`, `$.session.usage()`, `$.session.model()` in parallel, builds rows, returns a `Box`/`Text` tree. |

State is module-level (`agentModels`, `mainState`) — it lives in memory only and
resets if the mod reloads. That's fine here: it's repopulated as agents spawn again.

### Rendering model

Uses a tiny React-like API: `$.ui.resolve(e)` gives you `{ Box, Text }` factory
functions (not JSX — plain function calls with a props object, e.g.
`Text({ color: 'green', children: ['●'] })`). `Box` takes `flexDirection`, `gap`,
`children`. Everything is composed from `agentRow(...)` / `usageRow(...)` helper
functions that build one row each.

### Model glyphs

`SHAPE_RULES` maps a regex over the model string to a glyph: `◆` opus, `●` sonnet,
`▲` haiku, `★` fable, `○` unknown/missing. `shortModel()` just strips the `claude-`
prefix for display.

### Status colors

`STATUS_COLOR` maps agent status strings (`pending`, `running`, `waiting`, `idle`,
`completed`, `failed`, `killed`) to a color name for that row.

### Usage bars

`bar(percent, width)` draws a `█`/`░` block bar. `barColor(percent)` goes
green < 70%, yellow 70–89%, red ≥ 90%.

Under each bar, `resetLabel(resetsAt)` adds a dim line like `resets Tue 27 Oct, 22:10`
(local time, formatted by hand so it reads the same everywhere). `resetsAt` is an
optional ISO 8601 string; when it is missing or unparseable the line is simply omitted.

`$.session.usage()` returns `{ startedAt, context, rateLimits, cost }`.
`rateLimits` is an array of `{ kind, percentUsed, resetsAt? }` where `kind` is
`'five_hour' | 'seven_day' | 'spend_limit'` (gateway accounts only).

**Gotcha already hit once:** the field is `kind`, NOT `window`. If the usage bars
show "no rate-limit data yet" again, check this first — `usage.rateLimits.find(r =>
r.kind === 'five_hour')` is the right shape. Confirmed against the vendored type
def at `.claude-plugin/types/claude-code/index.d.ts` (`SessionRateLimit`), not
guessed. Also: `rateLimits` can legitimately be empty for a bit right after
session start — it only populates once the engine's had at least one reading from
an API response, so an empty HUD in the first few seconds of a session is normal,
not a bug.

## Commands used to work on this

```
claude plugin validate .                  # lint the manifest + hooks.json + register.js
claude plugin test                        # runs tests/*.test.ts
claude plugin list                        # confirm it's installed/enabled and from where
claude plugin eval --trust-plugin         # runs evals/ cases if any exist (none yet here)
```

`claude plugin test` uses the mocking API from `tests/agent-hud.test.ts`: `on(event,
handler)` stubs what a hook call returns inside the test, then `$.ui.mount({...})`
renders the `Pane` component directly and `ui.find({})` lets you assert on the
rendered tree's text content.

No build step, no `package.json`, no bundler — the plugin loader runs `register.js`
as-is. Edits take effect on the next session/mod reload, not live mid-session.

## Skills repo row

Between the usage bars and the skill finder. Compares `~/.agents/skills` with the SKILLS
clone (`~/Documents/GitHub/SKILLS`) and shows `● in sync` (green), or what differs
(`2 changed, 1 new, 1 unpushed`, yellow) with a dim line of names (`~changed +new -removed`).
`sync ↑` appears only when out of sync; `↻` rechecks.

- **When it checks:** in the background at `session.start` (the pane does not wait on it),
  every 5 minutes (`REPO_CHECK_MS`), and on `↻`. The 30s repaint only redraws the saved result.
- **The work is a bash script**, `SYNC_SCRIPT`, sent on stdin to `bash -s -- check|sync` via
  `$.process.run` (no shell, so no files to ship). It prints tagged lines (`CHANGED`, `ADDED`,
  `REMOVED`, `AHEAD`, `BEHIND`, `DIRTY`, `OFFLINE`, `SYNCED`, `ERROR`) that `parseSyncOutput`
  reads into the `agent-hud.repoSync` state value. `SKILLS_LOCAL` / `SKILLS_REPO` env vars
  override the two paths.
- **A skill folder** is a top-level dir holding `SKILL.md`, so `mods/` and dot-dirs never count.
  The compare ignores `__pycache__`, `*.pyc`, `.git`, `node_modules`, `.DS_Store` and CRLF.
- **Sync** = hsdevloop `bundle.sh refresh` (its rule before any SKILLS sync), then mirror
  changed, new and deleted skill folders into the clone, commit **only those paths**
  (`chore: sync skills from <hostname>`), and push to the branch the clone tracks. It refuses
  when GitHub is unreachable, or when the clone is behind GitHub and has uncommitted edits;
  behind but clean, it fast-forwards first. Your other work in the clone (e.g. `mods/`) is
  never staged.
- **Git Bash, not WSL:** on Windows `bash` on PATH is WSL's `System32\bash.exe`. `findBash`
  derives Git Bash from `git --exec-path` (`…/mingw64/libexec/git-core` → `…/bin/bash.exe`),
  then tries `C:/Program Files/Git/bin/bash.exe`, `/bin/bash`, `bash`.
- **Editing the script:** it is a normal template literal, so `${` is written `\${`, and it
  has no backslashes or backticks (find uses `'('`, not `\(`). Keep it that way, or the module
  string stops matching what bash needs. Test it standalone first:
  `"/c/Program Files/Git/bin/bash.exe" -s -- check < script.sh`.
- Fails soft like the rest: any failure lands in the row as a red `● <error>`.

## Skill finder

Below the usage bars. `listSkills` takes `$.command.list()` and keeps `source` `user` and
`plugin` (built-in commands like `/help` are left out); on failure it returns `[]` so the
HUD still draws. `orderSkills` filters by name or description (case-insensitive) and puts
favourites first in starring order, the rest alphabetically.

- Row = two plain Buttons: `fav:<name>` toggles the star, `skill:<name>` calls
  `$.prompt.fill({ text: '/<name> ', mode: 'insert' })`.
- The `skill-search` Input updates `skillQuery` on every keystroke; Enter pastes the top match.
- State: `$.state` keys `agent-hud.skillQuery` and `agent-hud.favourites`, declared in
  `types/index.d.ts` (named in plugin.json `types`; validate checks every key against it,
  and rejects an `export {}` in that file). Favourites are mirrored to `$.store` key
  `favourites` and loaded in `session.start`, so they survive restarts.
- Clicks reach Buttons in the fullscreen terminal; elsewhere focus the pane (ctrl+x tab),
  move with Tab/arrows, Enter to press.
- Test stubs: `prompt.fill` is an event, so its stub returns `{ isFilled: true }`, not
  `{ value }`; stub `prompt.read` too.

## Possible future work (not done, just noted)

- The `agent.spawn` hook's `next(e)` call isn't wrapped in try/catch — `claude
  plugin validate` flags this as "gating hook without .catch". Harmless today
  since nothing throws there, but worth wrapping if this hook grows.
- No handling for `agent.spawn` failures/`agent.complete` — the HUD currently only
  removes a finished agent from the list because `$.agent.list()` stops returning
  it, not because this mod explicitly reacts to completion.

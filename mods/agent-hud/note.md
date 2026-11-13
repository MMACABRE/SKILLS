# agent-hud

A Claude Code plugin (mod) that opens a small terminal pane showing:
- the main session + any running subagents, each with a model glyph and status
- two usage bars: 5-hour session limit and 7-day weekly limit, each with its reset time
- a skill finder: search box, click a skill to paste `/name ` into the prompt, ☆/★ to favourite

Installed from this directory as `agent-hud@hossein-mods` (local marketplace), scope: user.

## Files

- `.claude-plugin/plugin.json`: plugin metadata (name, version, description, author).
- `.claude-plugin/marketplace.json`: registers this directory as a local marketplace
  (`hossein-mods`) with one plugin (`agent-hud`, source `./`).
- `.claude-plugin/types/`: vendored `.d.ts` files for the mod APIs. Not shipped logic.
  **This is the source of truth for what hook payloads and `$.*` calls look like.**
- `hooks/hooks.json`: names the one hooks module, `./register.js`.
- `hooks/register.js`: the wiring. Events write state, the render hook gathers data and
  hands it to the view. No drawing and no git in here.
- `hooks/view.js`: the drawing. Pure: plain data in, rows out, rows to elements.
- `hooks/repo-sync.js`: the skills-repo check and sync, and the state value holding its result.
- `types/index.d.ts`: the `$.state` contract.
- `tests/agent-hud.test.ts`: tests through the mock harness; they mount the pane and read
  what it drew, so they hold for any internal layout of the three modules.

`register.js` imports the other two with relative imports (`./view.js`). The engine, the
test kit and `claude plugin validate` all follow them; no build step.

## The one drawing rule (why the terminal used to break)

**A row is exactly one line, never wider than the pane, and there are never more rows than
the pane has room for.** Until 0.5.0 the pane broke the terminal's display three ways:

1. It sized the skill list from `e.viewport.rows`, which is the whole screen, not the pane.
   The tree came out taller than its box (29 rows into an 18-row pane in the test).
2. Rows were wider than `bodyColumns` (fixed 28-cell separators, unclipped agent rows), so
   they wrapped and every row below shifted.
3. Text from outside (skill descriptions, agent names, git errors) was drawn raw, control
   characters and escape codes included.

The fix lives in `view.js`:

- The pane's box is `e.props.bodyColumns` by `e.props.scroll.bodyRows`. Nothing else.
- Every row goes through `fit(row, width)`, which cuts its segments to the width. Each `Text`
  also carries `wrap: 'truncate-end'`, so a width the code misjudges truncates, never wraps.
- The skill list gets the rows the sections above leave (`size.rows - top.length`); the last
  row says how many were left out. Agents are capped the same way.
- Under 16 rows the pane is compact: no separators, no reset lines, no repo names line.
- Outside text goes through `plain()`: escape codes out, control characters and line breaks
  to one space, zero-width characters out. `cells()` counts CJK and emoji as two cells.
- Rows have no `gap`; a segment carries its own leading space. That way a row's text is its
  width, which is what the tests measure.

Tests: `every row fits a WxH pane` (three sizes) and `text from outside is drawn without
control characters`. Break `fit`, `plain` or the height budget and they fail.

## How it runs

`register(on)` subscribes hooks; every handler gets `($, e, next)`.

| Event | What it does |
|---|---|
| `session.start` | Interactive sessions only: loads favourites, registers `/hud`, opens the pane, starts the 30s repaint and 5 min repo check, kicks off the first check. A `-p` run or the SDK does none of it (no pane to draw, and no reason to fetch from GitHub). |
| `command.run` (`hud`) | Opens the pane again after it was closed. |
| `agent.spawn` | After the spawn, records the agent's model in the `agentModels` state value (newest 64). |
| `turn.start` / `turn.complete` | Sets the `mainStatus` state value. |
| `ui.render` (`Pane`, `requestId: 'hud'`) | Reads everything in parallel, builds a plain `hud` object, returns `drawPane(elements, hudRows(hud, size, actions))`. |

**State is in `$.state`, not module variables.** A write redraws the pane by itself (no
`$.ui.invalidate` needed) and survives a hot reload. The 30s timer still invalidates, because
agent statuses and usage have no change event. Two module variables remain in
`repo-sync.js`, both deliberate: the cached Git Bash path and the in-flight guard.

**An atom is declared in the file that uses it.** The engine scans each file for the state
it reads and writes, and refuses `update($, importedAtom, ...)`. So `repo-sync.js` owns the
`repoSync` atom and exports `readRepoSync($)`; `register.js` owns the other four.

**Everything fails soft.** `soft(promise, fallback)` wraps each data source in the render
hook and each step of `startHud`: one failing source leaves its section empty, never the pane.

### Rows and segments

`hudRows(hud, size, actions)` returns rows. A row is `{ key, segments }` or `{ key, input }`.
A segment is `{ text, color?, dimColor?, bold? }`; with `press` (its Button key) and `onPress`
it is a Button, and `detail` is a dim tail inside the same Button. `drawPane` maps rows to
`Box`/`Text`/`Button`/`Input` from `$.ui.resolve(e)`. A style prop is passed only when set.

### Model glyphs

`MODEL_GLYPHS` maps a regex over the model string to a glyph: diamond for opus, filled
circle for sonnet, triangle for haiku, star for fable, hollow circle for unknown or missing.
The `claude-` prefix is dropped for display, and the model name is the first thing an agent
row drops when the pane is narrow.

### Status colors

`STATUS_COLOR` maps agent status strings (`pending`, `running`, `waiting`, `idle`,
`completed`, `failed`, `killed`) to a color name for that row.

### Usage bars

`usageRows` draws a block bar, 14 cells or fewer when the pane is narrow.
`usageColor(percent)` goes green under 70%, yellow from 70%, red from 90%.

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
- **The work is a bash script**, `SYNC_SCRIPT` in `hooks/repo-sync.js`, sent on stdin to `bash -s -- check|sync` via
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

- `claude plugin validate` notes "gating hook without .catch: agent.spawn". The hook's own
  bookkeeping is already soft; only `next(e)` can throw, and that should reach the caller.
- The glyphs (stars, model shapes, bar blocks, the recheck arrow) are "ambiguous width": one
  cell in most terminals, two with some CJK fonts or settings. If rows still look shifted by
  a cell, swap them for ASCII in `view.js` (`MODEL_GLYPHS`, `usageRows`, `skillRow`,
  `repoRows`).
- The HUD only drops a finished agent because `$.agent.list()` stops returning it.

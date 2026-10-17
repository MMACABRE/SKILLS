---
name: modz
description: Scaffold, write, validate, test, and ship Claude Code mods (plugin hooks modules that add panes, bands, commands, status lines, or tool-call rules to a Claude Code session). Use for /modz, "make me a mod", "build a Claude Code mod", or when debugging/extending an existing mod.
argument-hint: "[describe the mod you want — e.g. 'a pane that shows git status above the prompt']"
---

# /modz — build Claude Code mods

A **mod** is a plugin whose `hooks/hooks.json` points at a JS/TS file (the *hooks module*). That file exports `register(on)`, which calls `on(eventName, [matcher], hook)` to handle events Claude Code fires (tool calls, prompts, turns, drawing). A hook gets `($, e, next)` — the mods API, the event, and the next handler — and can **observe** (`return next(e)`), **rewrite** (`return next({...e, ...})`), or **answer** (`return {...}` without calling `next`).

Claude Code already ships a built-in skill called `plugin-authoring` for this (run `/plugin-authoring` to load it directly). This skill is a faster, opinionated path on top of it: known-good templates, this machine's conventions, and the gotchas that actually trip people up. When in doubt about current event/API shape, trust `.claude-plugin/types/*.d.ts` that Claude Code writes next to a loaded mod over anything below — the API can change between releases.

## Before scaffolding: is a mod even the right tool?

| Want to... | Use |
|---|---|
| Draw a pane/band/button, or change what Claude Code itself draws (spinner, dialogs, message rows) | **Mod** — only a mod can draw |
| Block/allow/log a tool call with a script you already have, no UI | A settings hook (`hooks` in `settings.json`) — simpler, no reload loop |
| Give Claude reusable instructions/knowledge | A Skill (`SKILL.md`) |
| Give Claude new tools from an external service | An MCP server |

If the ask is "just refuse this Bash pattern" or "log every edit to a file" with no UI and no persistent in-process state, say so and offer the settings-hook version instead of building a mod.

## Workflow

### 0. Pick a location
Default new mods to `~/mods/<name>` (this machine has no project git repo to anchor them in, and the docs recommend keeping dev mods outside the session-scoped `~/.claude/dev-mods/` folder so they survive). Ask only if the user wants it somewhere else (e.g. inside a specific project to share via that repo's marketplace).

PowerShell:
```powershell
New-Item -ItemType Directory -Force "$HOME\mods\<name>\.claude-plugin", "$HOME\mods\<name>\hooks"
```
Bash:
```bash
mkdir -p ~/mods/<name>/.claude-plugin ~/mods/<name>/hooks
```

### 1. Write the three required files

`.claude-plugin/plugin.json`:
```json
{
  "name": "<name>",
  "version": "0.1.0",
  "description": "<one sentence>",
  "author": { "name": "Hossein" }
}
```
Rules: `name` must not look like one of Anthropic's own (no `claude-` prefix). Letters/digits/`_`/`-`, same rule applies to command, tool, and pane names you register (max 64 chars).

`hooks/hooks.json`:
```json
{
  "description": "The <name> hooks module",
  "modules": ["./register.js"]
}
```

`hooks/register.js` — start from the pattern that matches the ask:

**Observe + redraw a status line** (e.g. "show X above the prompt" / "beside the spinner"):
```javascript
let value = null // module-level = resets on hot reload; use $.state if it must survive one

export function register(on) {
  on('session.start', async ($, e, next) => {
    await takeReading($)
    return next(e)
  })
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    await takeReading($) // turn.start/turn.complete only ever fire for the main loop (no e.agentId exists on them) — nothing to skip
    return result
  })
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (value === null) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    return Box({ paddingX: 1, children: [Text({ children: [String(value)] })] })
  })
}

async function takeReading($) { /* set `value`, then $.ui.invalidate('ui.render') if not using $.state */ }
```

**Add a command**:
```javascript
on('session.start', async ($, e, next) => {
  await $.command.register({ name: 'foo', description: '...', argumentHint: '[optional arg]' })
  return next(e)
})
on('command.run', { command: 'foo' }, async ($, e) => {
  return { text: 'reply shown in transcript, args in e.args' }
})
```

**Guard/hold a tool call**:
```javascript
on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
  if (!RISKY.test(e.command)) return next(e)
  let answer = 'Refuse'
  try { answer = await $.ui.ask('Run this? ' + e.command, ['Run it', 'Refuse']) } catch {}
  if (answer !== 'Run it') return { deny: 'User declined. Ask before trying another approach.' }
  return next(e)
})
```

**Open a pane**: register a command that calls `await $.ui.open({ id, title, focus: true, closeOnEscape: true })`, then draw it with `on('ui.render', { component: 'Pane' }, ...)` filtered on `e.requestId === id`.

Full event/API/element tables are in `reference.md` next to this file — check there before guessing a name.

### 2. Validate before touching a session
```bash
claude plugin validate ./<name>
```
Fix everything it reports. Common first-timer failures (static analysis, not runtime — it parses the source):
- Mods API calls must be written in full at the call site: `$.ui.log(...)`, never `const ui = $.ui; ui.log(...)` (fails: `$.ui is used as a value`). The one exception: passing `$` itself into a top-level function in the same file.
- Event name must be a string literal: `on('tool.call', ...)`, never a variable or loop.
- Don't shadow `on` — no second param/variable named `on` inside `register`.
- Only `import` (ES module), never `require` or dynamic `import()`. Only relative imports to files inside the plugin dir, plus the bare `claude-code` import.
- Register a given event only once per matcher — put everything for `session.start` in one hook, not several.

### 3. Load it and try it
```bash
claude --plugin-dir ./<name>
```
Edits hot-reload on save (transcript prints a reload line + the hooks list). If a command you added doesn't show up, the module failed to load — check `claude --debug-file ./mod-debug.log --plugin-dir ./<name>` in a second terminal, `tail -f` it, grep the mod's name.

For a quick non-interactive smoke test of a command: `claude -p "/foo" --plugin-dir ./<name>`.

### 4. Write a test
`claude-code/testing` gives a fake `$`/`on` with no session, model, or network — fire events, stub whatever your mod calls, assert the result.
```typescript
// <name>/tests/<name>.test.ts
import { expect, test } from 'claude-code/testing'

test('description', async ($, on) => {
  on('tool.call', () => ({ result: 'ok' })) // stub what your mod's next(e) would hit
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  const answer = await $.command.run({ command: 'foo', args: '' })
  expect(answer.text).toBe('...')
})
```
Run from the mod directory: `claude plugin test`. Remember: `session.start` doesn't fire on its own in a test — fire it yourself if a later hook depends on what it set up, and stub every mods-API call your mod makes (`$.command.register` etc.) or it rejects with `no implementation for ...`.

### 4b. Gotchas learned building a real mod (agent/usage HUD pane)

These cost real debugging time; trust them over the templates above where they conflict.

- **`$.ui.open`'s `closeOnEscape` only accepts `true` or omission — never `false`.** Its type is literally `closeOnEscape?: true`. Passing `false` throws at runtime (`closeOnEscape is true or left out (host check)`). Leaving it out means Escape returns the keys but leaves the pane open — that's the "always-on HUD" behavior, not `false`.
- **`PaneOpenArgs` has no `placement` field.** You cannot force dock vs. inline from `$.ui.open` — the surface decides (dock in fullscreen, inline above the prompt otherwise). Only `rows` (inline height) and `columns` (dock width) are requests, not grants.
- **A `types/index.d.ts` contract must contain zero `import`/`export...from` statements**, even `import 'claude-code'` for side effects — validation fails with "the contract must be self-contained" / "a contract is types only". Just open directly with `declare module 'claude-code' { interface PluginState { '<plugin-name>': {...} } }` and nothing else. If you don't actually use `$.state`, skip the `types` field and file entirely rather than leaving a stub around.
- **`$.agent.list()`'s `AgentInfo` has no `model` field** — only `id`, `description`, `type`, `status` (`AgentStatus = 'pending'|'running'|'waiting'|'idle'|'completed'|'failed'|'killed'`), `parentId`, `spawnedBy`, `name`, `teammateId`. To show a subagent's model, capture it yourself from the `agent.spawn` hook: `const result = await next(e); agentModels.set(result.agentId, result.model)` — `next(e)` on `agent.spawn` resolves to `{ model, agentId }` once the subagent actually started.
- **For subagent state, trust `$.agent.list()[].status` directly — don't hand-roll it from turns.** Subagent turns don't surface through `turn.start`/`turn.complete` on the main loop anyway (see the fixed snippet above); the engine already tracks `pending/running/waiting/idle/completed/failed/killed` per agent for you.
- **A "gating" hook (one that calls `next(e)` then still does work with the result) trips a validator *warning*** ("gating hook without .catch") **even when it's correct.** Don't reflexively add `.catch(...)` — a `.catch` handler that calls `next(e)` again after the real `next(e)` already ran will double-fire the action (e.g. double-spawn an agent). Instead wrap only your post-`next()` bookkeeping in a plain internal `try { } catch {}` so a bug there can't fail the thing `next()` already did.
- **`claude plugin test` (via `claude-code/testing`) has no implicit "core" beneath your plugin — not even for the event you're manually driving.** Calling `$.session.start({ cwd, surface, isInteractive })` yourself still throws `no implementation for session.start` unless you also `on('session.start', () => ({ cwd: '...' }))` in the test. Omitting the args entirely (`$.session.start()`) produces a much more confusing cascade (`WeakMap keys must be objects...`, `next() takes the event's argument`) — always pass the real input shape.
- **Two different stub shapes exist in tests, and mixing them up gives a clear but easy-to-miss error:**
  - Proper lifecycle/domain events (`session.start`, `agent.spawn`, `turn.start`, `turn.complete`, ...) — stub with the **bare result**: `on('session.start', () => ({ cwd: '/tmp' }))`.
  - A plain `$.<namespace>.<method>()` call re-exposed as an event (`ui.open`, `clock.every`, `agent.list`, `session.usage`, `session.model`, ...) — stub with **`{ value: ... }`** (or `{ deny }`): `on('agent.list', () => ({ value: [...] }))`. The error names which one you got wrong: `returned neither { value } nor { deny }` vs. `returned no { cwd }`-style messages.
  - `clock.every`'s real `ResultOf` is `void` (the `Timer`/`cancel()` wrapper is built client-side, never crosses the test's clone boundary) — stub it `on('clock.every', () => ({ value: undefined }))`; returning a function throws `result: not plain data: The object can not be cloned.`

### 5. State that must survive a reload or a session
- Module-level variable → gone on every hot reload. Fine for anything disposable.
- `$.state` (`atom`/`read`/`update` from `claude-code`) → survives reload, reactive (redraws automatically), cleared by `/clear`/`/resume`/`/branch`. Needs a `types/index.d.ts` declaring `PluginState['<plugin-name>']` and `"types"` in `plugin.json`. To survive `/clear` too, also reload from `$.store` in a `classic.SessionStart` hook filtered to `{ source: ['clear','resume','fork'] }`.
- `$.store` → a JSON file per plugin under `~/.claude/plugins/store/`, shared by every session on the machine, survives everything. Not atomic — re-`get` right before you `set` if more than one session writes it.

### 6. Share it (only if asked)
Zip/send the directory for a few people, or set up a marketplace (`.claude-plugin/marketplace.json` listing `{"name", "source": "./<name>"}`) for a team, installed with `/plugin marketplace add` + `/plugin install <name>@<marketplace>`. Don't increment-and-republish during development — keep testing against `--plugin-dir`, since an installed copy is cached by version.

## Reference tables

See `reference.md` in this skill's folder for the full events list, `$` API namespace table, render sites, elements, and limits (time limits, size limits, redraw throttling) — pulled from the live Claude Code docs so it doesn't go stale silently. If it ever contradicts the `.d.ts` files Claude Code generates next to a loaded mod, the `.d.ts` wins.

## When the user just describes a mod in plain language

Don't ask them to learn the API. Pick the closest pattern above, scaffold all three files, validate, load with `--plugin-dir`, and show it working — then iterate from their feedback. Only stop to ask when the ask is ambiguous about *where it draws* (pane vs. band vs. replacing something Claude Code already draws) or *when it should trigger*.

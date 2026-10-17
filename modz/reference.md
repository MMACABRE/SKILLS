# Mods reference (condensed from code.claude.com/docs/en/plugins/mods/reference, Claude Code v2.1.289)

The authoritative copy is always `.claude-plugin/types/claude-code/index.d.ts`, generated beside any mod you load with `--plugin-dir`. Use this file to know what to search for there.

## Files a mod needs

| File | Required | Contents |
|---|---|---|
| `.claude-plugin/plugin.json` | Yes | Plugin manifest |
| `hooks/hooks.json` | Yes | `{ "modules": ["./register.js"] }` — path relative to this file |
| The hooks module | Yes | Exports `register(on, options)`. Extensions: `.js .mjs .cjs .jsx .ts .mts .cts .tsx`, ES module only |
| `types/index.d.ts` (path set via `"types"` in manifest) | Only if using `$.state` or adding an API namespace | Declares `PluginState` entries |
| `*.test.ts` / `*.test.tsx` | No | Run by `claude plugin test` |

## The hook function

`on(eventName, [matcher], hook)`. Matcher fields: a value, an array (any-of), or a regex. `*` matches every event except telemetry. Registering the same event twice with no matcher fails validation.

Hook args: `$` (API), `e` (frozen event data), `next(e)` (continue chain → resolves to result), `next.signal` (AbortSignal, aborts if event abandoned), `next.origin` (`{plugin, tier}`), `next.budget` (`.ms`, `.remainingMs`), `next.to(e, tier)` (prepend/append only), `next.error`/`next.called` (in `.catch` only).

`on(...).catch(handler)` sets an error handler for that one hook — handler gets `($, e, next)` with `next.error.kind` = `'throw'|'timeout'`.

## Events

**Tools**: `tool.call` (about to run tool → `next(e)` / `{deny}` / `{result}`), `tool.check` (permission decision → `{decision: 'allow'|'ask'|'deny'}`), `tool.describe` (description sent to Claude once per tool).

**Prompts**: `prompt.submit` (→ `next({...e,text})` / `next({...e,context})` / `{drop}`), `prompt.fill`/`prompt.suggest`/`prompt.edit`, `prompt.compose` (system prompt sections), `prompt.section` (one section, `{text}` or `{text:null}` to omit), `prompt.context` (first-message context, `{blocks}`), `prompt.attachment` (a reminder Claude Code adds), `skill.prompt` (a skill's expanded text), `attribution.text`.

**Commands/config**: `command.run` (→ `{text}` / `{}` / `next(e)`), `command.describe`, `config.set` (→ `next({...e,value})` / `{deny}`), `config.describe`.

**Turns**: `turn.start`, `turn.step` (async generator, one per model request — `yield* next(e)`, or `next({...e,model})`/`next({...e,effort})`), `turn.complete` (→ `next(e)` or `{text}` shown under the answer).

**Session**: `session.start` (once per loaded mod, before first prompt + after each reload; not after `/clear`/`/resume`/`/branch`), `session.end`, `session.compact` (→ `{skip:reason}`), `session.receive`/`session.send` (cross-session messages), `session.append` (→ `next({...e,message})`), `session.attach`/`session.detach`, `session.measure`.

**Subagents**: `agent.offer` (→ `{isOffered:false}` to withhold), `agent.spawn` (→ `next({...e,model})` or `{deny}`).

**Interface**: `ui.render` (a render site about to draw), `ui.resolve` (element table building), `ui.press`/`ui.input`/`ui.select` (control used), `ui.focus`/`ui.scroll`, `ui.close` (pane about to close), `ui.message` (Client element posts data), `ui.fault` (Client element failed — `e.phase`='load'|'render'|'run').

**Other mods**: `plugin.register` (a hooks module about to load — `e.uses` lists its declared events/calls/env/state; → `{refuse:reason}`), `engine.create` (API being built for this mod).

**Telemetry**: `telemetry.log`/`telemetry.mark` — in an installed mod, require matcher `{to:'collector'}` or validation fails. `*` doesn't match these.

**Settings hooks**: every classic hook event is also `classic.<Event>` (e.g. `classic.Stop`, `classic.PostToolUse`, `classic.SessionStart` with `e.source` = `'clear'|'resume'|'fork'|...`). `e` is the stdin JSON a settings hook would get.

**Mods API calls as events**: every `$` method is also interceptable as an event named `namespace.method` (e.g. `fs.read`, `ui.open`) — a hook on it can `next(e)` / `{deny}` / `{value}`.

## `$` API namespaces

| Namespace | Methods |
|---|---|
| `$.plugin` | `name`, `root` |
| `$.ui` | `resolve`, `invalidate`, `open`, `close`, `panes`, `focus`, `scroll`, `toast`, `status`, `log`, `notice`, `ask`, `copy`, `selection`, `blit` |
| `$.command` | `register`, `run`, `list` |
| `$.tool` | `register`, `call`, `check`, `list` |
| `$.agent` | `register`, `spawn`, `list` |
| `$.model` | `complete`, `fork`, `classify` |
| `$.prompt` | `submit`, `read`, `fill`, `suggest`, `compose` |
| `$.turn` | `abort` |
| `$.session` | `messages`, `cwd`, `root`, `model`, `turns`, `id`, `repo`, `surfaces`, `usage` (`{startedAt,context:{tokens,window,percent},rateLimits,cost}`), `version`, `compact`, `send`, `append`, `authorize` |
| `$.config` | `list`, `set` |
| `$.settings` | `read` |
| `$.env` | `get`, `set` (name must be a string literal) |
| `$.fs` | `read`, `write` (not atomic), `list` (non-recursive), `exists`, `stat`, `ancestors` — 4 MiB/file |
| `$.store` | `get`, `set`, `delete`, `keys` — shared across sessions on the machine, 4 MiB JSON total |
| `$.state` | `get`, `set` (prefer `atom`/`read`/`update`/`derive`/`memberOf` from `claude-code`) — per-session, reactive, reset by `/clear` etc. |
| `$.clock` | `now`, `sleep`, `after`, `every` |
| `$.http` | `fetch` → `{status,ok,headers,text}` |
| `$.process` | `run` (argv array, no shell, 30s default timeout, 10min max), `spawn` (streaming) |
| `$.mcp` | `call`, `connect` |
| `$.audio` | `play`, `speak` |
| `$.telemetry` | `log`, `mark` |

## Render sites (`e.component` in a `ui.render` hook)

| Site | `e.props` | Surfaces |
|---|---|---|
| `Pane` | title, isFocused, bodyColumns, placement, scroll, view | Terminal, Desktop |
| `AbovePrompt` | hasSurvey, isWorking, maxRows, bodyColumns, scroll, view | Terminal, Desktop |
| `UserMessage`/`AssistantMessage` | text / origin etc. | Terminal, Desktop |
| `ToolUse`/`ToolResult`/`ToolGroup` | tool name, input, result | Terminal, Desktop |
| `CommandOutput` | command, text | Terminal, Desktop |
| `AskUserQuestion` | question + options | Terminal, Desktop |
| `ToolProgress` | kind | Terminal only |
| `Spinner` | word, message, suffix, mode | Terminal, Desktop |
| `TurnDuration` | word, durationMs | Terminal only |
| `InfoNotice` | text, command | Terminal only |
| `SessionMode` | modes | Terminal, Desktop |
| `PromptHint` | isDraft, isWorking, hint | Terminal, Desktop |

Width: read `e.props.bodyColumns`. Height: `e.props.scroll.bodyRows` (dock placement) or pane grows up to the `rows` you passed `$.ui.open` (inline placement).

## Elements (from `$.ui.resolve(e)`)

`Box` (flex layout), `Text` (color/bold/dimColor/italic/wrap), `Button` (key/label/onPress/hotkey/plain/action, Everywhere), `Link`, `Code`, `Markdown` (text prop not children, ≤10,000 chars), `Input` (key/label/placeholder/value/submitLabel/onSubmit/onInput — Terminal/Desktop), `Select` (Terminal/Desktop), `Svg` (Desktop only), `Client` (own-file region, posts via `ui.message`, failures via `ui.fault` — Terminal/Desktop), `Raster` (grid of cells, ≤512×256 — Terminal only), `Image` (PNG/RGBA ≤2MiB or file path — Terminal only).

## Limits

| Limit | Value |
|---|---|
| Hook execution time (excl. time in `next`/mods-API calls other than `$.clock.sleep`) | 10s (50ms for `prompt.edit`) |
| `.catch` handler | 1s |
| All `session.end` hooks together | ~1.5s |
| `$.process.run` timeout | 30s default, 10min max |
| `$.model.complete` `maxTokens` | 1024 default, up to 64,000 |
| `$.fs.read`/`write` | 4 MiB/file |
| One `Text` string child | 10,000 chars |
| `$.store` total | 4 MiB JSON |
| `$.session.messages()` | newest 4,096 entries |
| `$.ui.invalidate('ui.render')` | throttled 10/s (30/s terminal visible pane/band/hint) |
| `$.ui.toast` | shown 4s unless `timeoutMs` given |
| Unsolicited pane placement | needs ≥144 cols (≥110 after user has opened it once) |
| Command/tool/agent/pane names | letters, digits, `_`, `-`, ≤64 chars |
| One `claude plugin test` test | 5s unless `timeoutMs` set |

## CLI / slash commands

| Command | What it does |
|---|---|
| `/plugin` | Shows `N mod(s) active · names` line; Installed tab to enable/disable |
| `claude plugin validate <dir>` | Static analysis: reports events handled, API calls made, errors. `--strict`, `--json` |
| `claude plugin test [dir]` | Runs `*.test.ts`/`*.test.tsx`, exit 1 on failure |
| `claude --plugin-dir <dir>` | Loads a plugin dir for one session, hot-reloads on save. Repeatable flag. |
| `/reload-plugins` | Reloads plugins now |

## Order mods run in

1. Built-in guard `sec-default@builtin`, then org `prependPlugins`, then other org mods not in `appendPlugins`
2. Mods you install (a mod runs before its own `dependencies`)
3. Org `appendPlugins`
4. Other built-in mods

First mod in the chain is outermost — sees the event first, the result last, and decides if later mods run at all.

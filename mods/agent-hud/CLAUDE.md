# agent-hud: working memory

How this mod was built and how to change it safely. Read this first, then `note.md`
for how the code is put together. Claude Code loads this file automatically when it
works in this folder.

## Where things live

- **Source (edit here):** `mods/agent-hud/` in the `MMACABRE/SKILLS` GitHub repo (public),
  cloned at `~\Documents\GitHub\SKILLS`. Commit and push changes from there. Until
  2026-10-27 it lived in `~\mods\agent-hud`; that folder no longer exists.
- **Installed copy (never edit):** `~\.claude\plugins\cache\hossein-mods\agent-hud\<version>\`.
  Claude Code runs this copy. Older version folders stay behind there and are harmless.
- **Install route:** this folder is also the local marketplace `hossein-mods`
  (`.claude-plugin/marketplace.json`, source `./`), added with
  `claude plugin marketplace add <clone>\mods\agent-hud` and installed as
  `agent-hud@hossein-mods`, scope user. On another machine: clone the repo, add that
  folder as a marketplace, then `claude plugin install agent-hud@hossein-mods`.
- **Vendored types are not in git:** `.claude-plugin/types/` ignores itself. The engine
  rewrites it when it loads the mod, so on a fresh clone `tsc` only works after one session
  has loaded the mod.
- **API types (source of truth):** `.claude-plugin/types/claude-code/index.d.ts`, about 15k
  lines. Grep it for the event or `$` call you need; don't guess shapes.
- **State contract:** `types/index.d.ts`, named in `plugin.json` as `"types"`.

## How to make a change

1. Read `note.md` and the relevant part of `hooks/register.js`.
2. Look up every API you'll touch in the vendored types (grep `export type <Name> =`,
   `'event.name'`, or the `$` method).
3. **Test first:** add a failing test to `tests/agent-hud.test.ts` and watch it fail for
   the right reason.
4. Implement in `hooks/register.js` (plain JS, no build step, one file).
5. Check all of it:
   ```
   claude plugin test .
   claude plugin validate .                          # README/LICENSE/icon warnings are fine (directory-only)
   npx -y -p typescript@5.6.3 tsc -p . --noEmit
   ```
6. Bump `version` in `.claude-plugin/plugin.json`, then install:
   ```
   claude plugin marketplace update hossein-mods
   claude plugin update agent-hud@hossein-mods
   ```
   Confirm the new `<version>` folder appears in the cache, then restart Claude Code.
7. Update `note.md` (architecture) and the changelog below.

## Gotchas already hit (don't rediscover them)

- **Stub signature in tests:** handlers are `($, e, next)`, so the input is the 2nd argument:
  `on('clock.every', (_$, e) => …e.ms)`.
- **Stub return shape:** a `$` call (`command.list`, `store.get`, `agent.list`) is stubbed
  with `{ value }`. An *event* such as `prompt.fill` is stubbed with the event's own result
  (`{ isFilled: true }`). `$.prompt.fill` also needs a `prompt.read` stub.
- **Unstubbed calls throw** in tests, so the render hook fails and `$.ui.mount` reports
  "no implementation for ui.render". That's why skill listing and the favourites load are
  wrapped to fail soft: one broken section must never blank the whole HUD.
- **`tsc` on tests:** `$.ui.mount` Pane props need `placement`, `scroll` and `view`, not just
  `title`, `isFocused` and `bodyColumns`.
- **State contract file:** no `export {}` at the end, or validate rejects it ("a contract
  exports types and nothing else"). Every `$.state` key the module uses must be declared there.
- **No state writes while drawing:** write from `onPress`, `onInput` or `onSubmit` handlers or
  other events. `update($, atom, fn)` resolves to the new value.
- **Persisting:** `$.state` lasts the session (it survives hot reloads). Anything kept across
  restarts is mirrored to `$.store` (favourites, under key `favourites`).
- **Rate limits:** the field is `kind` (`five_hour` / `seven_day`), not `window`; `resetsAt`
  is an *optional* ISO string; `rateLimits` is empty until the first API response.
- **Skills:** these are `$.command.list()` entries with `source` `user` or `plugin`;
  `builtin` and `mcp` are excluded.
- **Clicks** reach Buttons only in the fullscreen terminal. Elsewhere it's keyboard
  (ctrl+x tab, Tab/arrows, Enter).
- Bundle-loader skills (`/hs24skills`, `/hsuiux`) can't load `review-animations`; the user
  has to run that one themselves.

## Changelog

- **0.3.0 (2026-10-27):** skill finder below the usage bars: search box (Enter pastes the
  top match), click to insert `/name ` at the prompt cursor, ☆/★ favourites pinned to the top
  and saved in `$.store`. Pane height 14 → 30 rows. Skill listing and favourites load fail
  soft.
- **0.2.0 (2026-10-27):** dim "resets Tue 27 Oct, 22:10" line (local time) under each usage
  bar; repaint timer 3s → 30s.
- **0.1.0:** first version: main session and subagent rows with model glyph and status,
  5-hour and weekly usage bars.

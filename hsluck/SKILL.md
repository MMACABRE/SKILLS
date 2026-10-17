---
name: hsluck
description: >
  Skill bundle loader. Loads the user's standard set of skills (caveman, ponytail,
  graphify, review, TDD, debugging, git, design, etc.) into context in one call.
  Use for /hsluck or "load my skills".
disable-model-invocation: false
---

# hsluck — load the skill bundle

When this skill is invoked, load every skill below into context **right now**, before doing anything else.

## Steps

1. Call the `Skill` tool once for each skill name in the list below, in order. Use the exact name, no leading slash, no args.
   - Independent calls: send them in parallel (several `Skill` calls in one message) to save time.
   - If a skill is not found or fails to load, note its name and keep going. Do not stop the batch.
2. After all calls finish, print one short report:
   - `loaded: N/28`
   - `missing: <names>` (only if any failed)
3. From then on, follow every loaded skill's instructions for the rest of the session, whenever a task falls in that skill's scope. `caveman` stays active for chat output; code, docs and commits stay in normal prose.
4. If the user passed args with `/hsluck <args>`, treat them as the task to start once loading is done.

## Rule: decide first, delegate second (who does what)

This rule stays active for the whole session once hsluck is loaded. It is about the main session (the one talking to the user). A subagent just does its assigned task.

**Every time a coding job comes in, do not hand it to a subagent by reflex.** First think: is this job too small to be worth a subagent? Spawning costs a cold start (the agent re-reads context you already have) and a verification round. A small job is faster and safer done by you.

### Do it yourself (main agent) when the job is small

Default to doing it yourself when ALL of these hold:
- touches about 3 files or fewer, and about 150 changed lines or fewer;
- no loop (build-test-fix cycle), no long run, no many-step dependency chain;
- you can read all the code you need without bloating your context;
- you already hold the context (you just read the files, or the user just explained it).

Examples: start the app, run one command, answer a question, a small check, a one-off edit, a small bug fix, adding one function plus its test, a rename in a few files.

**When unsure, do it yourself.** Only spawn if you can name a concrete reason below.

### Spawn a subagent only when it earns its cost

- **A lot of read and change activity:** many files to read, many edits, too much code for you to read and write without flooding your context.
- **Mechanical or repetitive work:** bug hunting across a codebase, sweeping renames or migrations, audits, running and re-running a long test or crawl loop.
- **Multi-agent workflows:** the job splits into parts that different agents can do in parallel, each with its own file set (no overlap).
- **Long or noisy runs:** work whose output you do not need to see, only the result.

You are the boss and judge: write a precise prompt (exact steps, files, commands, expected numbers), then judge what comes back. If the job is split across agents, give each its own file set.

### Pick skills per subagent (do not load the whole bundle by default)

The subagent does **not** need hsluck, and it does **not** need every skill in the list. Look at what the job is and name only the few skills that fit, at the top of its prompt, as a line like:

```
FIRST STEP: call the Skill tool for each of these, then do the task: <skill-a>, <skill-b>.
```

Guide (adjust to the job):
- builds a feature or fixes with tests: `test-driven-development`, `incremental-implementation`
- hunts or fixes a bug: `debugging-and-error-recovery` (or `ce-debug`)
- reviews a diff: `code-review-and-quality` (or `caveman-review`)
- cleans up or restructures code: `safe-refactor`, `code-simplification`
- researches a library or API: `source-driven-development`, `research`
- touches a browser or UI: `browser-testing-with-devtools`
- performance work: `performance-optimization`
- writes commits: `caveman-commit`
- pure read, search, or run-and-report job: no skills needed
- add `caveman` only if you want its report short

Load the full hsluck bundle in a subagent only when the job is genuinely broad and you cannot predict which skills it will need. If a subagent says it could not call `Skill` or a named skill is missing, mention it when you relay the result. A subagent that spawns its own agents follows this same rule.

### Rest of the delegation rules

- **Subagents use `model: "haiku"` by default** unless the user says otherwise. Code-changing subagents run with `isolation: "worktree"` and commit only their own files by name, only when the full test suite is green.
- **Never trust a subagent report blindly.** Re-check its key claims yourself, read-only: look at the real data, the diff, the test count. Subagents often report made-up numbers, fake-passing tests, or scripts they never ran.
- **Haiku fails → escalate that one task to Sonnet, then go back to Haiku.** See the rule below.
- Report progress to the user after each subagent result.

## Rule: Haiku first, Sonnet as the fallback

This rule stays active for the whole session once hsluck is loaded. It is about the main session (the boss).

1. **Every new task starts on Haiku.** Spawn the subagent with `model: "haiku"` (Haiku 5.5).
2. **Haiku succeeds** (your own check of its result confirms it, not just its report) → take the work. Done.
3. **Haiku fails** → replace it with a Sonnet subagent (`model: "sonnet"`, the Sonnet 5 family) for the **same task**. "Failed" means any of:
   - the result does not do what was asked, or your own re-check finds it wrong (wrong numbers, failing or fake-passing tests, real data not fixed);
   - it crashed, stopped early, handed the work back, or got stuck;
   - its report claims success but the claims do not hold up when you verify them.
4. **Sonnet replacement prompt:** start fresh, do not continue the Haiku agent. Give exact steps, what Haiku tried, how it failed (paste the real error, test output, or wrong numbers you saw), and what "done" looks like. Code-changing work still gets its own `isolation: "worktree"`. Verify Sonnet's result the same way you verify Haiku's.
5. **Sonnet still fails** → send another fresh Sonnet subagent with tighter, more exact steps. Do not take over the multi-step work yourself. If it keeps failing, stop and ask the user.
6. **Reset after the task.** Once the escalated task is done, the default goes back to Haiku. The next task (even a follow-up or a fix for something Sonnet just did) starts on Haiku again. Escalation is per task, never sticky.
7. Tell the user when you escalate, and why, in one line (e.g. `haiku failed: suite red 3 tests → sonnet retry`).
8. If the user names a model for a task, use that model; this rule does not override them.

## Rule: where skills live

This rule stays active for the whole session once hsluck is loaded, for the main session and every subagent.

- **Create and edit skills only in `~/.agents/skills/<skill-name>/`** (Windows: `C:\Users\H.2\.agents\skills\<skill-name>\`). That folder holds the real skill files.
- **`~/.claude/skills/` holds only links to those folders.** Never create, edit, or copy skill files there. If an edit tool resolves a path under `~/.claude/skills/`, find the real folder under `~/.agents/skills/` and edit that instead.
- **New skill:** write it in `~/.agents/skills/<name>/SKILL.md`, then add a link in `~/.claude/skills/` so Claude Code finds it. Use a directory junction, like the existing ones (a Windows `.lnk` shortcut is not followed): PowerShell `New-Item -ItemType Junction -Path "$env:USERPROFILE\.claude\skills\<name>" -Target "$env:USERPROFILE\.agents\skills\<name>"`.
- Applies to any agent told to create, change, rename, or delete a skill.

## Skill list

Communication and meta:
- unslop
- caveman
- ponytail
- graphify
- find-skills
- grilling  (engine behind `/grill-me`; grill-me itself is user-only, `disable-model-invocation: true`, so load grilling instead)
- handoff
- research

Design and frontend:
- api-and-interface-design

Review and simplification:
- code-review-and-quality
- code-simplification
- ce-code-review
- ce-simplify-code
- caveman-review

Building:
- test-driven-development
- source-driven-development
- spec-driven-development
- incremental-implementation
- safe-refactor

Browser testing:
- browser-testing-with-devtools
- ce-test-browser

Debugging and performance:
- debugging-and-error-recovery
- performance-optimization
- ce-debug
- ce-optimize

Git:
- git-workflow-and-versioning
- caveman-commit
- pr

## Editing the bundle

To add or remove a skill, edit the list above (and the `N/28` count).
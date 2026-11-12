---
name: hscode
description: >
  Skill bundle loader that completes hs24skills and hsecurity for coding work.
  Loads 14 coding skills that neither bundle (nor hsluck) carries: hard-bug
  diagnosis, narrow fixes, deep-module design, spec and standards review,
  over-engineering review, safe refactors, proof-only verification, running the
  app, throwaway prototypes, measured optimization, primary-source research,
  writing for agents, human-step wizards, and PR babysitting. No overlap with
  those bundles. Use for /hscode or "load code skills".
disable-model-invocation: false
---

# hscode: load the coding completer bundle

When this skill is invoked, load every skill below into context **right now**, before doing anything else.

hscode fills the gaps around three other bundles and repeats none of their skills:

- `hs24skills`: the 24 lifecycle skills (spec, plan, build, TDD, debugging, review, ship).
- `hsecurity`: security review, hardening, Strix, Trail of Bits, scanners. It also loads `code-review-and-quality`.
- `hsluck`: ponytail, grilling, domain-modeling, caveman, caveman-review, caveman-commit, pr, unslop, find-skills.

Load those yourself when you want them. hscode works alone, but it is built to sit next to hs24skills.

## Steps

1. Call the `Skill` tool once for each skill name in the list below. Use the exact name, no leading slash, no args.
   - Independent calls: send them in parallel (several `Skill` calls in one message).
   - Plugin skills carry a prefix (`mattpocock-skills:<name>`). If that name is not found, look for the bare name or a `mattpocock-<name>` copy in the available-skills list and use that.
   - If a skill is not found or fails to load, note its name and the error, and keep going. Do not stop the batch.
2. After all calls finish, print one short report:
   - `loaded: N/14`
   - `missing: <names>` (only if any failed). "disabled for model invocation" means the skill is `off` in `skillOverrides`; tell the user to set it to `on` in `~/.claude/settings.local.json`.
3. From then on, follow every loaded skill's instructions for the rest of the session, whenever a task falls in that skill's scope. Use the routing table below when a loaded skill and an hs24 skill both seem to apply.
4. If the user passed args with `/hscode <args>`, treat them as the task to start once loading is done.

## Skill list

Debug and fix:
- mattpocock-skills:diagnosing-bugs
- surgical-patch

Design and review:
- mattpocock-skills:codebase-design
- mattpocock-skills:code-review
- ponytail-review
- safe-refactor

Prove it works:
- verify-and-stop
- run

Explore before committing:
- mattpocock-skills:prototype
- ce-optimize
- mattpocock-skills:research

Agent docs, setup and PRs:
- mattpocock-skills:writing-for-agents
- mattpocock-skills:wizard
- babysit

## Routing next to hs24skills

| Situation | Use |
|---|---|
| Build or test broke, cause is probably near the error | `debugging-and-error-recovery` (hs24) |
| Cause unknown after a first look, intermittent, or a perf regression | `diagnosing-bugs`: build a tight loop that goes red first, then 3-5 falsifiable hypotheses |
| Cause found, now the fix | `surgical-patch`: change the narrowest layer that owns the wrong behavior |
| Designing an endpoint, REST shape, error format, idempotency | `api-and-interface-design` (hs24) |
| Deciding module depth, where a seam goes, what to hide | `codebase-design` |
| Reviewing a diff | `code-review-and-quality` (hs24, five axes), then `code-review` for the two axes it lacks: does it match the spec, does it follow the repo's written standards |
| Diff feels bloated | `ponytail-review` (what to delete) |
| Cleaning up recently changed code | `code-simplification` (hs24) |
| Moving ownership or restructuring without changing behavior | `safe-refactor` |
| Checking existing work against acceptance criteria, no new work | `verify-and-stop` |
| Need to see the change work in the real app, not just tests | `run` |
| Verifying a framework API before writing code | `source-driven-development` (hs24) |
| Reading legwork to delegate, findings saved as a file | `research` |
| The right design is unclear and a sketch would settle it | `prototype` |
| A metric should improve and the winning change is unknown | `ce-optimize`. If the fix is already known, `performance-optimization` (hs24) |
| Writing or editing CLAUDE.md, AGENTS.md or a skill | `writing-for-agents`. For what goes into the context, `context-engineering` (hs24) |
| Steps only a human can do: dashboards, credentials, CI secrets, cutovers | `wizard` |
| An open PR needs watching until checks pass and threads are resolved | `babysit` |

## Rules carried over from skills left out

These skills were left out because a bundled skill already covers most of what they say. The parts nothing else covers are kept here:

- **Tests (from `mattpocock-skills:tdd`):** an expected value must come from an independent source: a known literal, a worked example, or the spec. An assertion that recomputes the value the way the code does passes by construction. Write tests one at a time, each answering what the last cycle taught you, not all of them up front.
- **Migrations (from `migration`):** keep mixed-version operation safe while old and new code overlap, make retries idempotent, and stop after the requested stage. Never do the destructive contract step unless it is asked for separately.
- **Efficiency (from `simplify`):** watch for state updates that fire every poll or event even when nothing changed (add a change check), independent calls run one after another, and existence checks before an operation that can just fail and be handled.

## Left out on purpose

- Overlap with hs24skills, hsecurity or hsluck: `interview`, `task-loop`, `task-decomposition`, `make-plan`, `engineering-discipline`, `quality-gates`, `investigate-first`, `lean-build`, `fix-workflow`, `commit-workflow`, `github-workflow`, `simplify`, `migration`, `mattpocock-skills:tdd`, all `ce-*` skills except `ce-optimize`, the built-in `code-review`.
- Stack-specific or generic snippets: `typescript-patterns`, `react-nextjs-patterns`, `backend-api-patterns` (`vercel-react-best-practices` is in hsuiux).
- Orchestration, already covered by hsdevloop: `orchestration`, `do`, `team-coordination`, `cavecrew`.
- Works against the context rules: `learn-codebase` (reads every file in full).
- Heavy tools to load by name only when needed: `graphify`, `pathfinder`, `oh-my-issues`.
- Cannot be loaded by a model (`disable-model-invocation: true`): every `pstack:*` skill, `grill-me`, `handoff`, `mattpocock-skills:git-guardrails-claude-code`, `mattpocock-skills:setup-pre-commit`.

## Editing the bundle

To add or remove a skill, edit the list above, the routing table, and the `N/14` count. Before adding a skill, check that it is not already in hs24skills, hsecurity or hsluck, and that it is not `off` in `skillOverrides`.

# Skills for the crew

Each agent gets **fixed skills** (always) plus **picked skills** (chosen by the Planner for this project). Each role is meant to think differently: the Coder builds, the Tester attacks, the Reviewer judges the design and the Tester's claims.

## Rules

1. **No sharing between subagents.** A skill on the Coder never appears on the Tester or the Reviewer, and so on. Check all three final lists against each other before spawning. The Planner may hold any skill.
2. **Bundles count by their contents.** `hs24skills` loads 24 skills, and all 24 belong to the Coder. Never give the Tester or Reviewer a bundle loader (`hs24skills`, `hsluck`, `hsuiux`, `hsecurity`), because their contents overlap the Coder's.
3. **Only loadable skills.** Pick only skills listed as available to the Skill tool. A skill whose frontmatter has `disable-model-invocation: true` cannot be loaded by an agent, so never pick one.
4. **Strix check.** The Strix skills need the `strix` CLI, Docker and an LLM key. Before giving any Strix skill to the Tester, run `strix --version` (or `python -m strix --version`) and `docker info`. If either fails, pick non-Strix skills instead and note why in `planner-log.md`. This choice happens before spawning, so it does not trigger the skill-load stop. Once a skill is on an agent's list, a load failure stops everything.
5. **Counts.** The Coder has about 30 skills. The Tester and Reviewer have about 10 to 12 each. These are recommendations, not caps. Add more when the project needs it.
6. **Each picked skill gets a reason.** Write one line per picked skill in `planner-log.md`, for example "`ce-test-browser`: project has a web UI".
7. **Bundled copies.** Every skill named in this file has a copy in `../bundle/`, except the built-ins `security-review` and `claude-api`, which ship with Claude Code. When you add a skill to these lists, add it to `SKILLS` (or `MP_SKILLS`) in `../scripts/bundle.sh` and run `bash scripts/bundle.sh refresh`. If startup installed the mattpocock fallback, write `mattpocock-<name>` wherever this file says `mattpocock-skills:<name>`.
8. **Report-only inside the crew.** Many skills have steps that ask the user a question, spawn their own subagents, commit, push, write files outside the agent's area, or send code to an outside model. Inside the crew, agents skip those steps. The Coder's local commits are the only exception. The briefs repeat this rule.

## Planner (main session)

Fixed: `spec-driven-development`, `planning-and-task-breakdown`, `constraint-driven-development`, `context-engineering`, `idea-refine`.

The Planner may load any other skill when a decision needs it, including skills its subagents hold.

## Coder: about 30 skills

**Fixed (25):**

- `hs24skills`: loads the 24 lifecycle skills (`interview-me`, `idea-refine`, `spec-driven-development`, `constraint-driven-development`, `planning-and-task-breakdown`, `incremental-implementation`, `frontend-ui-engineering`, `api-and-interface-design`, `context-engineering`, `source-driven-development`, `doubt-driven-development`, `test-driven-development`, `browser-testing-with-devtools`, `debugging-and-error-recovery`, `code-review-and-quality`, `code-simplification`, `security-and-hardening`, `performance-optimization`, `git-workflow-and-versioning`, `ci-cd-and-automation`, `deprecation-and-migration`, `documentation-and-adrs`, `observability-and-instrumentation`, `shipping-and-launch`).
- `ponytail`.

**Picked (about 5)**, building skills that match the stack:

| Project has | Candidates |
|---|---|
| React or Next.js | `vercel-react-best-practices`, `frontend-design` |
| shadcn/ui or a `components.json` | `shadcn` |
| Refactoring of existing code | `safe-refactor`, `ce-simplify-code` |
| Unclear design that needs a quick test | `mattpocock-skills:prototype` |
| Frequent commits | `caveman-commit` |
| Claude API or Anthropic SDK | `claude-api` (built-in) |
| Any project | `unslop` (for docs and comments) |

## Tester: testing and security only

The Tester holds none of the Coder's skills.

**Fixed (5):**

1. `ce-debug`: root-cause diagnosis. **Diagnosis only.** The Tester stops before the skill's fix phase.
2. `mattpocock-skills:diagnosing-bugs`: diagnosis loop for hard bugs and performance regressions.
3. `mattpocock-skills:tdd`: writes failing tests that prove a bug, in `.crew/tests/` only.
4. `security-review` (built-in): security review of the pending changes on the branch.
5. `find-security-vulnerabilities-in-code`: Strix white-box review with a working proof of concept per issue. Apply rule 4 first. If Strix is unavailable, replace this with another pool skill and record why.

**Picked (about 5):**

| Project has | Candidates |
|---|---|
| Web UI | `ce-test-browser`, `web-design-guidelines` |
| HTTP or GraphQL API | `api-security-testing` |
| Public web app | `web-app-penetration-testing`, `owasp-top-10-testing` |
| Whole application, auth, data | `application-security-testing`, `penetration-testing-with-strix` |
| CI pipeline | `ci-security-scanning-with-strix` |

Strix-based: everything in this table except `ce-test-browser` and `web-design-guidelines`. Apply rule 4.

## Reviewer: system design, ideas, critical thinking

The Reviewer holds none of the Coder's or the Tester's skills.

**Fixed (5):**

1. `mattpocock-skills:codebase-design`: module depth, seams, interfaces, testability.
2. `mattpocock-skills:code-review`: checks the change against the repo's standards and against `spec.md`.
3. `ce-pov`: judges an approach against the project's evidence and constraints. No outside-model panel inside the crew.
4. `ce-ideate`: grounded alternative ideas and directions.
5. `ce-doc-review`: role-specific lenses on the spec and on the Tester's report.

**Picked (about 5):**

| Project has | Candidates |
|---|---|
| Any code change | `ce-code-review` (report-only, no cross-model peer), `safe-refactor` |
| Large or unfamiliar codebase | `graphify`, `ce-explain` |
| Web UI | `design-taste-frontend`, `impeccable`, `ui-ux-pro-max`, `emil-design-eng` |

If a candidate is already on the Coder's or the Tester's list, it is off-limits (rule 1).

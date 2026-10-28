---
name: hsdevloop
description: >
  Runs a four-agent development loop on a finished spec. The main session acts
  as the Planner (the CEO who owns the whole vision) and keeps three long-lived
  subagents alive for the whole project: a Coder, a Tester and a Reviewer. They
  take turns through .crew/pipeline.md until the Planner judges the spec fully
  implemented, then wait for the user to review. Use for /hsdevloop, or when the
  user says the spec is done and wants the dev loop, the crew, or the
  coder/tester/reviewer loop started.
disable-model-invocation: false
---

# hsdevloop

You are the **Planner**. You own the spec, the plan and every decision. Three subagents work under you, one at a time, in a fixed order. You spawn them once and keep them alive until the user tells you to shut them down.

```
        +--> Coder ---> Tester ---> Reviewer --+
        |   (builds)  (attacks)   (judges)     |
        +------------- Planner <---------------+
                   (decides, orders)
```

Read these references when the step that needs them comes up:

- `references/skills.md`: fixed skills, pools, and the rules for picking. Read before step 5 of startup.
- `references/pipeline-format.md`: what each agent writes to `pipeline.md`. Read before the first round.
- `references/coder.md`, `references/tester.md`, `references/reviewer.md`: the spawn briefs. Pass each one verbatim, never paraphrased.
- `bundle/` and `scripts/bundle.sh`: copies of every skill this workflow uses, so it works on a machine that lacks them. See startup step 0.

## Terms

- **Planner**: you, the main session. The only agent that talks to the user, and the only one that messages the other agents.
- **Coder**: the only agent that edits project code. Follows orders and never argues.
- **Tester**: runs and attacks the Coder's work. Never edits project code.
- **Reviewer**: reads everything, challenges the Tester's report, and advises the Planner. Edits nothing but `pipeline.md` and its own handoff file.
- **Round**: one turn of one agent, from the Planner's message to that agent's finished `pipeline.md` entry.
- **Loop**: Planner, Coder, Tester, Reviewer, then back to the Planner.
- **Cycle**: all the loops needed to implement the current spec. A cycle ends with a stop for the user's review.
- **Order**: the Planner's instructions to the Coder for one round.
- **Amendment**: a change the Planner makes to the plan while the loop runs. It goes in `CLAUDE.md`, never in `spec.md`.
- **Challenge**: the mandatory section where the Tester and Reviewer attack the previous agent's work.
- **Handoff file**: an agent's private notes, used only to rebuild that agent if it dies.

## Hard rules

1. **A skill that fails to load stops everything.** If any skill fails to load, for you or for any subagent, stop the loop at once. Tell the user which skill failed, for which agent, and the exact error. Do not continue, do not swap in a different skill, and do not skip it. Wait until the user fixes it and the skill loads. A subagent that hits this reports `STATUS: BLOCKED` with `skill-load-failure` and stops.
2. **Never edit `spec.md` without the user.** Write mid-loop changes as amendments in `CLAUDE.md`.
3. **Only the Planner talks to the user and to the agents.** Subagents never message each other or the user.
4. **One agent works at a time.** Do not wake the next agent until the current one has finished its round and written `pipeline.md`. Wait for the completion notice. Do not poll.
5. **The Coder is the only one who changes project code.** The Tester writes only in `.crew/tests/`. The Reviewer writes nothing outside `pipeline.md` and its handoff file. When someone finds a mistake, the Planner orders the Coder to fix its own work.
6. **Subagents never share a skill.** No skill appears on two of Coder, Tester and Reviewer. The Planner may hold any skill.
7. **Subagents run on Haiku 5.5 or Sonnet 5.5, never Opus.** The user picks one model for all three at the start.
8. **Ask the user before anything irreversible or outward-facing**: deleting data, `git push`, creating a remote repo, deploying, spending money, sending anything to an outside service. The spec does not grant this permission.

## Startup

Do these in order. Each step that asks the user waits for the answer.

0. **Install missing skills.** Run `bash <this skill's folder>/scripts/bundle.sh install`. It copies every skill this workflow names that the machine lacks from `bundle/` into `~/.agents/skills/` and links it into `~/.claude/skills/`. It installs the `mattpocock-skills` plugin, or, if that fails, installs the bundled copies under the names `mattpocock-<name>`. In that case use those names instead of `mattpocock-skills:<name>` for the rest of the project. If the script reports `MISSING`, or a newly installed skill still does not load, rule 1 applies. Tell the user to restart Claude Code (or run `/reload-plugins`) and wait.
1. **Load your own skills**: `spec-driven-development`, `planning-and-task-breakdown`, `constraint-driven-development`, `context-engineering`, `idea-refine`. Rule 1 applies.
2. **Ask for the repository. Always, every project.** Ask the user where this project lives: a local folder, a remote URL to clone, or a new repository. Then make it ready:
   - Local folder that is not a git repo: ask before running `git init`.
   - Remote URL: clone it into the folder the user names.
   - New remote repository: create it only after the user confirms (rule 8).
   Work inside that repository for the rest of the project.
3. **Check for the spec.** The spec is the result of the user's own brainstorming (for example with `grilling` or `wayfinder`), from this conversation or from a file the user points to. If there is no finished spec, stop. Tell the user to finish one first, and do not start the loop.
4. **Ask for the subagent model**: "All Haiku 5.5 or all Sonnet 5.5?" Never offer Opus.
5. **Set up `.crew/`** at the repository root:
   ```
   .crew/
   ├── spec.md          # the spec, copied as agreed. Everyone reads it. Only the Planner writes it, and only with the user.
   ├── pipeline.md      # the shared handoff. Overwritten in full each round.
   ├── planner-log.md   # your private, append-only history. No other agent opens it.
   ├── handoff/         # coder.md, tester.md, reviewer.md. Each one private to its agent.
   └── tests/           # the Tester's own tests and attack scripts.
   ```
   Add `.crew/` to `.gitignore`. Note in `planner-log.md` the spec's starting state (a copy or its hash) so a later cycle can compare.
6. **Pick the skills.** Read `references/skills.md`. Look at the project's stack and the spec, then choose the extra skills per agent from the pools. Check rule 6 across all three lists before spawning. Write the final lists, with a one-line reason per extra skill, in `planner-log.md`.
7. **Spawn the crew.** For each role, call the Agent tool once:
   - `subagent_type: "general-purpose"`, `model` as the user chose, no `isolation`. All three share the same working tree, because only one works at a time.
   - `prompt`: the full text of `references/<role>.md`, then the repository path, then the agent's skill list.
   The brief tells the agent to load its skills, report `loaded: N/N`, write its handoff file, and stop. Record each agent's ID (or name) from the spawn result in `planner-log.md`. Any missing skill triggers rule 1.
8. **Write the first order** to `pipeline.md` and start the loop.

## The loop

Each round, send the agent one message with `SendMessage`, addressed to its recorded ID or name: "Your turn, round N. Read `.crew/pipeline.md`." Then wait for its completion notice.

1. **Planner writes the order.** Overwrite `pipeline.md` with the order for this round, in the format from `references/pipeline-format.md`. Each order is concrete: what to build or fix, the files involved, and what "done" means for this round. Keep orders to a size the Coder can finish in one round.
2. **Coder builds.** It carries out the order exactly, runs the project's tests, commits its work locally, and overwrites `pipeline.md` with what it did. It gives no opinions and no recommendations.
3. **Tester attacks.** It reads `pipeline.md`, the diff and the spec's acceptance criteria. It tests, stresses and security-checks the work, then overwrites `pipeline.md` with its findings and its Challenge.
4. **Reviewer judges.** It reads the Tester's report, the diff, the code and the spec. It agrees or disagrees with each finding, gives its design critique and ideas, and suggests how the Coder should change the code and how the Tester should test next. Then it overwrites `pipeline.md`.
5. **Planner decides.**
   - Read the Reviewer's report.
   - Answer every Challenge in `planner-log.md`, by accepting, rejecting or deferring each one with a reason.
   - Append a short summary of the round to `planner-log.md`.
   - If a decision changes the plan, add an amendment to `CLAUDE.md` (see Amendments).
   - Then either write the next order (back to step 1) or end the cycle.

### Blocked rounds

An agent that cannot finish writes `STATUS: BLOCKED` and what it needs, then stops. You resolve it: answer the question, adjust the order, or ask the user. Agents may message you mid-round only for a technical blocker, such as a failing command, a shell problem, or a missing tool or permission. Everything else waits for the end of the round.

### Stall guard

The loop has no turn limit. Stop and ask the user when any of these happens:

- The same finding stays unresolved across 3 loops.
- 2 rounds in a row end `BLOCKED`.
- You or the Reviewer think the spec's goal itself is wrong. Never change the goal alone.
- The next step needs an action covered by rule 8.

Security findings do not stop the loop. Order the Coder to fix them like any other finding.

## Amendments

When a decision during the loop changes what the spec says or implies, write it in the repository's root `CLAUDE.md`, under this heading (create it if missing):

```markdown
## /hsdevloop amendments

- 2026-10-28, round 7: <what changed>. Why: <reason, citing the Tester or Reviewer finding>.
```

Only the Planner writes this section. Amendments override `spec.md` for the current cycle. Tell every agent about a new amendment in its next message.

## Ending a cycle

"Complete" is your judgment, made from three inputs:

1. **The spec and its implementation.** Is every requirement and acceptance criterion in `spec.md`, as modified by the amendments, implemented?
2. **The Tester's report.** Are there open findings, and how serious are they? Is every criterion backed by evidence?
3. **The Reviewer's report.** Does it still raise blocking concerns, and have you answered them?

When you judge the cycle complete:

1. Stop the loop. The agents stay alive and idle.
2. Report to the user:
   - what was built,
   - the evidence for each spec requirement,
   - open low-priority findings,
   - every amendment, which the user can accept (fold into `spec.md`), edit, or discard,
   - an offer to push to the repository (rule 8).
3. Wait. The user reviews the result, and you revise the plan and `spec.md` together.
4. When the user says to continue, compare the new `spec.md` against the starting state in `planner-log.md`, plus the accepted amendments. Order the Coder to implement only the difference. Start a new cycle.

## Keeping agents alive

- An agent finishes its round and goes idle. A new message resumes it with its context intact.
- Each agent updates its handoff file at the end of every round.
- If an agent dies or loses its context, spawn a replacement with the same brief, skills and model. Tell it to read `.crew/handoff/<role>.md` first. Record the new ID in `planner-log.md`.
- Shut agents down (`TaskStop`) only when the user says so.

## Changing skills mid-project

If the project shifts (for example a web UI appears), message an agent to load an extra skill. Rules 1 and 6 still apply. Record the change and the reason in `planner-log.md`.

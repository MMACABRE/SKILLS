# pipeline.md format

`.crew/pipeline.md` holds exactly one entry: the latest round. Each agent overwrites the whole file at the end of its round. Nothing from earlier rounds stays, except the `Files touched` line, which the Tester and Reviewer copy forward unchanged.

Every entry starts with the same header:

```markdown
# Round <N>: <Planner | Coder | Tester | Reviewer>
STATUS: DONE | BLOCKED
Files touched: <Coder's commit hash>, <file list>   (copied forward from the Coder's entry)
```

`BLOCKED` entries add a `## Blocked` section with what is missing and what would unblock it. A skill that failed to load is written as `BLOCKED: skill-load-failure <skill name>: <exact error>`.

## Planner entry (the order)

```markdown
## Order
1. <concrete task, files involved>
2. ...

## Done means
- <checkable condition for this round>

## Amendments in force
- <new amendments since the Coder's last round, or "none">
```

## Coder entry

```markdown
## Done
1. <order item 1>: <what was done>
2. ...

## Commands run
- `<command>`: <result, for example "42 passed, 0 failed">

## Not done
- <order item that could not be finished, and the technical reason, or "none">
```

The Coder writes no opinions, no suggestions and no Challenge.

## Tester entry

```markdown
## Findings
| # | Severity | Finding | Evidence | Repro |
|---|---|---|---|---|
| T1 | critical / high / medium / low | <what is wrong> | <test output, file:line> | <command or test in .crew/tests/> |

## Acceptance criteria
| Spec criterion | Status | Evidence |
|---|---|---|
| <criterion> | pass / fail / untested | <test or command> |

## What I ran
- <tests, stress runs, security checks, with results>

## Challenge
- Weakest point of the Coder's work: <one point>
- Evidence that would change my mind: <what>
- Confidence: <low / medium / high>
- Where my own testing is most likely wrong: <one point>
```

## Reviewer entry

```markdown
## On the Tester's findings
| # | Agree? | Reason | How the code should change |
|---|---|---|---|
| T1 | yes / no / partly | <reason> | <suggested change> |

## Design review
- <architecture, interfaces, structure: what is weak and why>

## Ideas
- <alternative approaches worth considering, each with its trade-off>

## Advice to the Planner
- For the Coder: <how to direct the next order>
- For the Tester: <what to test next, or what it missed>

## Challenge
- Weakest point of the Tester's report: <one point>
- Weakest point of the current plan or spec: <one point, or "none">
- Evidence that would change my mind: <what>
- Confidence: <low / medium / high>
- Where my own review is most likely wrong: <one point>
```

"Looks good" with no Challenge is not a valid Tester or Reviewer entry. The Planner sends it back.

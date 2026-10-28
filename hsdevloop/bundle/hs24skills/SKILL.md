---
name: hs24skills
description: >
  Loads the 24-skill agent-skills lifecycle bundle (interview-me through shipping-and-launch)
  into context in one call. Use for /hs24skills or "load 24 skills".
disable-model-invocation: false
---

# hs24skills — load the 24 lifecycle skills

When this skill is invoked, load every skill below into context **right now**, before doing anything else.

## Steps

1. Call the `Skill` tool once for each skill name in the list below, in order. Use the exact name, no leading slash, no args.
   - Independent calls: send them in parallel (several `Skill` calls in one message).
   - If a skill is not found or fails to load, note its name and keep going. Do not stop the batch.
2. After all calls finish, print one short report:
   - `loaded: N/24`
   - `missing: <names>` (only if any failed)
3. From then on, follow every loaded skill's instructions for the rest of the session, whenever a task falls in that skill's scope.
4. If the user passed args with `/hs24skills <args>`, treat them as the task to start once loading is done.

## Skill list

- interview-me
- idea-refine
- spec-driven-development
- constraint-driven-development
- planning-and-task-breakdown
- incremental-implementation
- frontend-ui-engineering
- api-and-interface-design
- context-engineering
- source-driven-development
- doubt-driven-development
- test-driven-development
- browser-testing-with-devtools
- debugging-and-error-recovery
- code-review-and-quality
- code-simplification
- security-and-hardening
- performance-optimization
- git-workflow-and-versioning
- ci-cd-and-automation
- deprecation-and-migration
- documentation-and-adrs
- observability-and-instrumentation
- shipping-and-launch

## Editing the bundle

To add or remove a skill, edit the list above (and the `N/24` count).
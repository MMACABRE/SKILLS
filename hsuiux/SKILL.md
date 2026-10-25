---
name: hsuiux
description: >
  Skill bundle loader for UI, UX and visual design work. Loads the design skills
  (frontend-design, impeccable, design-taste-frontend, ui-ux-pro-max, motion,
  shadcn, web design guidelines, browser checks) into context in one call.
  Use for /hsuiux or "load ui skills".
disable-model-invocation: false
---

# hsuiux: load the UI/UX design bundle

When this skill is invoked, load every skill below into context **right now**, before doing anything else.

## Steps

1. Call the `Skill` tool once for each skill name in the list below. Use the exact name, no leading slash, no args. Send the calls in parallel, in one message.
   - If a skill is not found or fails to load, note its name and keep going.
2. After all calls finish, print one short report:
   - `loaded: N/15`
   - `missing: <names>` (only if any failed)
3. From then on, follow every loaded skill's instructions for the rest of the session, whenever a task falls in that skill's scope.
4. If the user passed args with `/hsuiux <args>`, treat them as the task to start once loading is done.

## Workflow once loaded

1. Pick a design direction first (`design-taste-frontend`, `frontend-design`, `ui-ux-pro-max`). Set tokens for color, type scale, spacing and radius before building.
2. Build with real components (`shadcn`, `frontend-ui-engineering`, `vercel-react-best-practices`).
3. Open the result in a browser, take screenshots, and fix what looks off (`browser-testing-with-devtools`, `ce-test-browser`).
4. Critique and polish (`impeccable`, `web-design-guidelines`, `emil-design-eng`, `review-animations`).

## Skill list

Direction and aesthetics:
- frontend-design
- design-taste-frontend
- impeccable
- ui-ux-pro-max
- anthropic-skills:theme-factory

Building:
- frontend-ui-engineering
- shadcn
- vercel-react-best-practices
- dataviz

Motion:
- emil-design-eng
- review-animations
- animation-vocabulary

Review and verification:
- web-design-guidelines
- browser-testing-with-devtools
- ce-test-browser

## Editing the bundle

To add or remove a skill, edit the list above and the `N/15` count. Create and edit skills only in `~/.agents/skills/`; `~/.claude/skills/` holds links only.

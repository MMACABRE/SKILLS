---
name: hsfinish
description: Reads a project's markdown memory/planning files (CLAUDE.md, AGENTS.md, plan.md, TODO.md, NOTES.md, progress.md, etc.), updates them with the project's current progress, and compresses them so they stay short. Use for /hsfinish, or whenever the user says "update my plan files", "sync claude.md with progress", "compact my md files", "refresh the docs with where we are", or wants CLAUDE.md/plan.md trimmed and brought up to date, even if they do not name the skill.
---

# hsfinish

Bring the project's planning/memory markdown up to date with real progress, and shrink it. These files are loaded into context every session, so stale or bloated content costs tokens and misleads the next session.

## Steps

1. **Find files.** In the current project root (and `.claude/`, `docs/`), collect: `CLAUDE.md`, `AGENTS.md`, `plan.md`, `PLAN.md`, `TODO.md`, `NOTES.md`, `progress.md`, `ROADMAP.md`, `STATUS.md`, plus any `*plan*.md` / `*todo*.md`. Skip `node_modules`, `.git`, `vendor`, build output, `README.md` (public-facing), and the global `~/.claude/CLAUDE.md` unless the user asks. If none found, say so and stop.
2. **Sync check (git repos with a GitHub remote).** Do this before reading progress so the docs describe the real, current state:
   - `git fetch --prune` (read-only), then compare `HEAD` with its upstream: `git status -sb`, `git rev-list --left-right --count HEAD...@{u}`. Also check `git branch -vv` for other local branches that are ahead/behind or have no upstream.
   - Behind and working tree clean → `git pull --ff-only`. Behind with local changes, diverged, or ff not possible → do not merge/rebase/stash on your own; report it and continue with the local state.
   - Ahead (unpushed commits) or uncommitted/untracked files → list them. Never push or commit unasked; offer to, once, at the end.
   - Local files vs repo: flag tracked files deleted/renamed locally, and doc claims that disagree with the code (a path, command or script that no longer exists). Fix the doc, not the code.
   - No remote, no upstream, or `gh`/network unavailable → say sync was skipped and why; carry on.
3. **Back up.** In a git repo, git is the backup; check `git status` and note files with uncommitted edits (warn, still proceed). Outside git, copy originals to `.hsfinish-backup/<timestamp>/`.
4. **Gather progress** (evidence, not guesses):
   - `git log --oneline` since the files were last modified (`git log --since=<mtime>`), `git status`, `git diff --stat`.
   - Checkbox state, test/build results if cheap to run, and what happened in this conversation.
   - Verify claims against code when a plan item says "done" or "pending" and you doubt it. Never mark done without evidence.
5. **Update each file** by its role:
   - Plan/TODO: tick finished items, collapse completed phases into one line each, keep open items detailed, add newly discovered tasks, put a short `## Current status` and `## Next` at the top.
   - CLAUDE.md/AGENTS.md: refresh commands, structure, conventions that changed. Move one-off progress notes out to plan/status files.
   - Notes: merge duplicates, drop resolved items.
6. **Compress.** Cut filler, repeated explanations, and history that git already holds. Use terse fragments. Keep verbatim: code blocks, commands, file paths, URLs, env var names, headings, tables that carry data. Keep anything not derivable from code or git: decisions and their why, gotchas, constraints, credentials-handling rules, user preferences. When unsure if a line is still true or needed, keep it and mark `(verify)` rather than delete.
7. **Report.** Sync state (ahead/behind, pulled or not, uncommitted files), then per file: lines/bytes before and after, what was marked done, what was removed, what was marked `(verify)`. Do not commit or push; offer once.

## Rules

- Do not invent progress. No evidence → leave state unchanged.
- Do not change file names or merge files together.
- Do not touch content inside `<!-- keep -->...<!-- /keep -->` blocks.
- Preserve each file's existing section order and front matter.
- Aim for roughly 30-50% shrink; stop earlier if cutting more would lose non-derivable information.

#!/usr/bin/env bash
# Keeps copies of every skill hsdevloop names in ../bundle, so the skill can be
# carried to another machine and install what that machine is missing.
#
#   bash scripts/bundle.sh install   copy missing skills into ~/.agents/skills and link them
#   bash scripts/bundle.sh refresh   overwrite ../bundle with this machine's installed copies
#
# Built-in skills (security-review, claude-api) ship with Claude Code and are not bundled.
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
BUNDLE="$HERE/bundle"
AGENTS="$HOME/.agents/skills"
CLAUDE_SKILLS="$HOME/.claude/skills"
PLUGIN_CACHE="$HOME/.claude/plugins/cache"

# Plain skills. Keep in sync with references/skills.md.
SKILLS=(
  hs24skills interview-me idea-refine spec-driven-development constraint-driven-development
  planning-and-task-breakdown incremental-implementation frontend-ui-engineering
  api-and-interface-design context-engineering source-driven-development
  doubt-driven-development test-driven-development browser-testing-with-devtools
  debugging-and-error-recovery code-review-and-quality code-simplification
  security-and-hardening performance-optimization git-workflow-and-versioning
  ci-cd-and-automation deprecation-and-migration documentation-and-adrs
  observability-and-instrumentation shipping-and-launch
  ponytail vercel-react-best-practices frontend-design shadcn safe-refactor
  ce-simplify-code caveman-commit unslop
  ce-debug find-security-vulnerabilities-in-code ce-test-browser web-design-guidelines
  api-security-testing web-app-penetration-testing owasp-top-10-testing
  application-security-testing penetration-testing-with-strix ci-security-scanning-with-strix
  ce-pov ce-ideate ce-doc-review ce-code-review graphify ce-explain
  design-taste-frontend impeccable ui-ux-pro-max emil-design-eng
)
# Skills from the mattpocock-skills plugin (used as mattpocock-skills:<name>).
MP_PLUGIN="mattpocock-skills@claude-plugins-official"
MP_SKILLS=(prototype diagnosing-bugs tdd codebase-design code-review)

is_windows() { case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) return 0 ;; *) return 1 ;; esac; }

link_skill() { # $1 = skill name, already present in $AGENTS
  mkdir -p "$CLAUDE_SKILLS"
  if is_windows; then
    powershell.exe -NoProfile -Command "New-Item -ItemType Junction -Path '$(cygpath -w "$CLAUDE_SKILLS/$1")' -Target '$(cygpath -w "$AGENTS/$1")' | Out-Null"
  else
    ln -s "$AGENTS/$1" "$CLAUDE_SKILLS/$1"
  fi
}

copy_clean() { # $1 = source dir, $2 = destination dir
  rm -rf "${2:?}"
  mkdir -p "$(dirname "$2")"
  cp -r "$1" "$2"
  find "$2" \( -name .git -o -name node_modules -o -name __pycache__ -o -name '.env*' \) -prune -exec rm -rf {} +
}

mp_installed() { grep -q "\"$MP_PLUGIN\"" "$HOME/.claude/plugins/installed_plugins.json" 2>/dev/null; }

install() {
  local added=() missing=()
  for s in "${SKILLS[@]}"; do
    [ -f "$CLAUDE_SKILLS/$s/SKILL.md" ] && continue
    if [ ! -f "$BUNDLE/$s/SKILL.md" ]; then missing+=("$s"); continue; fi
    [ -f "$AGENTS/$s/SKILL.md" ] || copy_clean "$BUNDLE/$s" "$AGENTS/$s"
    [ -e "$CLAUDE_SKILLS/$s" ] || link_skill "$s"
    added+=("$s")
  done

  if ! mp_installed; then
    if claude plugin install "$MP_PLUGIN" >/dev/null 2>&1; then
      added+=("plugin:$MP_PLUGIN")
    else
      # Fallback: install the bundled copies as standalone skills named mattpocock-<name>.
      for s in "${MP_SKILLS[@]}"; do
        local name="mattpocock-$s"
        [ -f "$CLAUDE_SKILLS/$name/SKILL.md" ] && continue
        copy_clean "$BUNDLE/mattpocock-skills/$s" "$AGENTS/$name"
        awk -v n="$name" '!d && /^name:/ { print "name: " n; d = 1; next } { print }' \
          "$AGENTS/$name/SKILL.md" > "$AGENTS/$name/SKILL.md.tmp" && mv "$AGENTS/$name/SKILL.md.tmp" "$AGENTS/$name/SKILL.md"
        [ -e "$CLAUDE_SKILLS/$name" ] || link_skill "$name"
        added+=("$name (fallback for mattpocock-skills:$s)")
      done
    fi
  fi

  echo "installed: ${#added[@]}"
  for a in "${added[@]}"; do echo "  + $a"; done
  if [ ${#missing[@]} -gt 0 ]; then
    echo "MISSING (not installed and not in bundle): ${missing[*]}"
    exit 1
  fi
  [ ${#added[@]} -gt 0 ] && echo "Restart Claude Code (or run /reload-plugins) if a new skill does not load."
  return 0
}

refresh() {
  local fail=()
  for s in "${SKILLS[@]}"; do
    local src=""
    for d in "$AGENTS/$s" "$CLAUDE_SKILLS/$s"; do [ -f "$d/SKILL.md" ] && { src="$d"; break; }; done
    if [ -z "$src" ]; then fail+=("$s"); continue; fi
    copy_clean "$src/" "$BUNDLE/$s"
  done
  local mp_root
  mp_root="$(ls -d "$PLUGIN_CACHE"/claude-plugins-official/mattpocock-skills/*/ 2>/dev/null | sort -V | tail -1)"
  if [ -n "$mp_root" ]; then
    for s in "${MP_SKILLS[@]}"; do
      local src
      src="$(ls -d "$mp_root"skills/*/"$s" 2>/dev/null | head -1)"
      if [ -n "$src" ]; then copy_clean "$src/" "$BUNDLE/mattpocock-skills/$s"; else fail+=("mattpocock-skills:$s"); fi
    done
    cp "$mp_root/LICENSE" "$BUNDLE/mattpocock-skills/LICENSE" 2>/dev/null || true
  else
    fail+=("mattpocock-skills plugin")
  fi
  echo "bundled: $(ls "$BUNDLE" | grep -vc '^mattpocock-skills$') skills + ${#MP_SKILLS[@]} mattpocock-skills"
  if [ ${#fail[@]} -gt 0 ]; then echo "NOT FOUND on this machine: ${fail[*]}"; exit 1; fi
}

case "${1:-}" in
  install) install ;;
  refresh) refresh ;;
  *) echo "usage: bash $0 install|refresh" >&2; exit 2 ;;
esac

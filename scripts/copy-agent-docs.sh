#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEST_DIR="$REPO_ROOT/agents"

SOURCES=(
  "$HOME/.agents/agents"
  "$HOME/.pi/agent/git/github.com/HazAT/pi-interactive-subagents/agents"
)

mkdir -p "$DEST_DIR"

copied_any=0
for source_dir in "${SOURCES[@]}"; do
  if [[ ! -d "$source_dir" ]]; then
    printf '[skip] missing source dir: %s\n' "$source_dir"
    continue
  fi

  shopt -s nullglob
  files=("$source_dir"/*.md)
  shopt -u nullglob

  if [[ ${#files[@]} -eq 0 ]]; then
    printf '[skip] no .md files in: %s\n' "$source_dir"
    continue
  fi

  for file in "${files[@]}"; do
    cp "$file" "$DEST_DIR/"
    printf '[copy] %s -> %s\n' "$file" "$DEST_DIR/$(basename "$file")"
    copied_any=1
  done
done

if [[ "$copied_any" -eq 0 ]]; then
  printf 'No agent docs copied.\n'
  exit 1
fi

printf 'Done. Agent docs are in %s\n' "$DEST_DIR"

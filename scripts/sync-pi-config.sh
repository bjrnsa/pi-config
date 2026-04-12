#!/usr/bin/env bash
set -euo pipefail

DRY_RUN=0
FORCE=0
BACKUP=1

usage() {
  cat <<'EOF'
Usage: scripts/sync-pi-config.sh [options]

Symlink selected pi config paths from this repo into your home directory.

Options:
  --dry-run      Show what would change without making changes
  --force        Replace existing targets without prompting
  --no-backup    Remove existing targets instead of moving to a backup folder
  -h, --help     Show this help
EOF
}

log() {
  printf '%s\n' "$*"
}

run_cmd() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "[dry-run] $*"
  else
    "$@"
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      ;;
    --force)
      FORCE=1
      ;;
    --no-backup)
      BACKUP=0
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      log "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
  shift
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="$HOME/.pi-config-backups/$(date +%Y%m%d-%H%M%S)"

# Source in repo|destination in $HOME
TARGETS=(
  "skills|$HOME/.agents/skills"
  ".pi/agent/AGENTS.md|$HOME/.pi/agent/AGENTS.md"
  "agents|$HOME/.pi/agent/agents"
  ".pi/agent/extensions|$HOME/.pi/agent/extensions"
  ".pi/agent/settings.json|$HOME/.pi/agent/settings.json"
  ".pi/agent/models.json|$HOME/.pi/agent/models.json"
  ".pi/agent/git/.gitignore|$HOME/.pi/agent/git/.gitignore"
)

ensure_parent_dir() {
  local path="$1"
  local parent
  parent="$(dirname "$path")"
  run_cmd mkdir -p "$parent"
}

backup_or_remove() {
  local dest="$1"

  if [[ "$BACKUP" -eq 1 ]]; then
    run_cmd mkdir -p "$BACKUP_DIR"
    local name
    name="$(basename "$dest")"
    run_cmd mv "$dest" "$BACKUP_DIR/${name}.$RANDOM"
  else
    run_cmd rm -rf "$dest"
  fi
}

link_path() {
  local source_rel="$1"
  local dest="$2"
  local source="$REPO_ROOT/$source_rel"

  if [[ ! -e "$source" ]]; then
    log "[skip] Missing source: $source"
    return
  fi

  ensure_parent_dir "$dest"

  if [[ -L "$dest" ]]; then
    local current
    current="$(readlink "$dest")"
    if [[ "$current" == "$source" ]]; then
      log "[ok] $dest already points to $source"
      return
    fi
    if [[ "$FORCE" -ne 1 ]]; then
      log "[skip] $dest is a different symlink ($current). Use --force to replace."
      return
    fi
    backup_or_remove "$dest"
  elif [[ -e "$dest" ]]; then
    if [[ "$FORCE" -ne 1 ]]; then
      log "[skip] $dest already exists. Use --force to replace."
      return
    fi
    backup_or_remove "$dest"
  fi

  run_cmd ln -s "$source" "$dest"
  log "[link] $dest -> $source"
}

log "Repo root: $REPO_ROOT"
[[ "$DRY_RUN" -eq 1 ]] && log "Mode: dry-run"
[[ "$FORCE" -eq 1 ]] && log "Mode: force"
[[ "$BACKUP" -eq 0 ]] && log "Backup: disabled"

for entry in "${TARGETS[@]}"; do
  source_rel="${entry%%|*}"
  dest="${entry#*|}"
  link_path "$source_rel" "$dest"
done

if [[ "$BACKUP" -eq 1 && "$DRY_RUN" -eq 0 && -d "$BACKUP_DIR" ]]; then
  log "Backups stored in: $BACKUP_DIR"
fi

log "Done."

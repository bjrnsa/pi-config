# pi-config

Personal `pi` configuration and custom skills, tracked as source-of-truth in git.

## Should you use hardlinks?

Usually no.

- Hardlinks only work for files (not directories), and only on the same filesystem.
- They are easy to forget about and can cause surprising edits because both paths are the same inode.
- For config trees like `~/.pi/...` and `~/.agents/skills`, symlinks are a better fit.

This repo uses a symlink bootstrap script instead.

## What is worth syncing

### Sync these (high value)

- `~/.agents/skills` (your custom skills)
- `~/.pi/agent/AGENTS.md`
- `~/.pi/agent/agents`
- `~/.pi/agent/extensions`
- `~/.pi/agent/settings.json`
- `~/.pi/agent/models.json`
- `~/.pi/agent/verbosity.json`

### Usually do **not** sync

- Session history, logs, caches, temp files
- Machine-specific binaries and runtime data
- Secrets/tokens/credentials

## Bootstrap on a machine

From this repo root:

```bash
bash scripts/sync-pi-config.sh --dry-run
bash scripts/sync-pi-config.sh --force
```

### Script behavior

- Creates parent dirs as needed
- Symlinks tracked config paths into `$HOME`
- If a destination exists and `--force` is used, it is backed up to:
  - `~/.pi-config-backups/<timestamp>/...`
- Use `--no-backup` if you want replacement without backup

## Customize what gets linked

Edit the `TARGETS` array in:

- `scripts/sync-pi-config.sh`

Each entry is:

- `source_in_repo|destination_in_home`

#!/usr/bin/env bash
# Wire Claude Code's persistent memory directory into this repo via a symlink.
# Run once per machine after cloning. Idempotent (uses ln -sfn).
#
# The Claude harness expects memory at:
#   ~/.claude/projects/<slug>/memory/
# where <slug> is the project root path with '/' replaced by '-'. The repo
# carries the actual files at .claude/memory/; the symlink redirects the
# harness to them so memory writes are git-tracked and sync across machines.

set -euo pipefail

PROJECT_ROOT=$(cd "$(dirname "$0")/.." && pwd)
SLUG=$(echo "$PROJECT_ROOT" | sed 's|/|-|g')
TARGET="$HOME/.claude/projects/${SLUG}/memory"
SOURCE="$PROJECT_ROOT/.claude/memory"

if [ ! -d "$SOURCE" ]; then
  echo "error: $SOURCE not found — wrong repo root?" >&2
  exit 1
fi

mkdir -p "$(dirname "$TARGET")"

if [ -L "$TARGET" ]; then
  current=$(readlink "$TARGET")
  if [ "$current" = "$SOURCE" ]; then
    echo "already linked: $TARGET -> $SOURCE"
    exit 0
  fi
  echo "replacing existing symlink: $TARGET (was -> $current)"
elif [ -e "$TARGET" ]; then
  echo "error: $TARGET exists and is not a symlink. Move or remove it manually." >&2
  exit 1
fi

ln -sfn "$SOURCE" "$TARGET"
echo "linked: $TARGET -> $SOURCE"

#!/usr/bin/env bash
# local-sync.sh — Iterate local plugin changes without /plugin update
# Pulls latest `local` branch into marketplace clone, syncs to cache, reminds user to reload.
set -euo pipefail

MARKETPLACE="${HOME}/.claude/plugins/marketplaces/agmo-local"
CACHE="${HOME}/.claude/plugins/cache/agmo-local/agmo/0.7.1"

if [ ! -d "$MARKETPLACE" ]; then
  echo "[ERROR] Marketplace clone not found: $MARKETPLACE" >&2
  exit 1
fi

echo "[1/3] Pulling latest on marketplace clone..."
git -C "$MARKETPLACE" pull --ff-only origin local

echo "[2/3] Syncing marketplace → cache..."
mkdir -p "$CACHE"
rsync -a --delete --exclude='.git/' "${MARKETPLACE}/" "${CACHE}/"

echo "[3/3] Done. Run /reload-plugins in Claude Code to activate changes."

#!/bin/bash
# Job Scout — macOS run script
# Equivalent of run-jobs.bat for Unix systems.
# Scheduled via launchd — see SKILL.md for setup instructions.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOGFILE="$HOME/.job-scout/job-scout.log"

mkdir -p "$HOME/.job-scout"
echo "[$(date)] Starting job scan" >> "$LOGFILE"

node "$SCRIPT_DIR/prepare-jobs.js" 2>>"$LOGFILE" \
  | node "$SCRIPT_DIR/generate-digest.js" 2>>"$LOGFILE" \
  | node "$SCRIPT_DIR/deliver.js" 2>>"$LOGFILE"

echo "[$(date)] Done (exit $?)" >> "$LOGFILE"

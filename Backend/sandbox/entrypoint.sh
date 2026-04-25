#!/usr/bin/env bash
set -euo pipefail

export DISPLAY="${DISPLAY:-:99}"
export SCREEN_WIDTH="${SCREEN_WIDTH:-1280}"
export SCREEN_HEIGHT="${SCREEN_HEIGHT:-720}"
export SCREEN_DEPTH="${SCREEN_DEPTH:-24}"

exec /usr/bin/supervisord -c "/home/pwuser/sandbox/supervisord.conf"


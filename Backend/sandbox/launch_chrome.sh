#!/usr/bin/env bash
set -euo pipefail

export DISPLAY="${DISPLAY:-:99}"
URL="${CHROME_URL:-https://www.google.com}"

# Try Playwright-bundled Chromium first (present in Playwright base image).
CHROME_BIN=""
if [ -d "/ms-playwright" ]; then
  CHROME_BIN="$(ls -1d /ms-playwright/chromium-*/chrome-linux/chrome 2>/dev/null | head -n 1 || true)"
fi

# Fallbacks (just in case the base image layout changes).
if [ -z "${CHROME_BIN}" ] && command -v chromium >/dev/null 2>&1; then
  CHROME_BIN="chromium"
fi
if [ -z "${CHROME_BIN}" ] && command -v google-chrome >/dev/null 2>&1; then
  CHROME_BIN="google-chrome"
fi

if [ -z "${CHROME_BIN}" ]; then
  echo "Could not find a Chromium/Chrome binary (expected Playwright Chromium under /ms-playwright)." >&2
  exit 1
fi

mkdir -p /home/pwuser/.config /home/pwuser/.cache /home/pwuser/chrome-profile

exec "${CHROME_BIN}" \
  --user-data-dir=/home/pwuser/chrome-profile \
  --no-first-run \
  --no-default-browser-check \
  --disable-dev-shm-usage \
  --disable-features=TranslateUI \
  --disable-background-networking \
  --disable-sync \
  --disable-breakpad \
  --disable-gpu \
  --window-size=1280,720 \
  "${URL}"


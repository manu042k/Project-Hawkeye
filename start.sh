#!/usr/bin/env bash
set -e

BACKEND_DIR="$(cd "$(dirname "$0")/Backend" && pwd)"
LOG_DIR="$BACKEND_DIR/logs"
mkdir -p "$LOG_DIR"

stop_all() {
  echo ""
  echo "Stopping all backend processes..."
  kill "$REDIS_PID" "$API_PID" "$WORKER_PID" "$BEAT_PID" 2>/dev/null || true
  wait 2>/dev/null || true
  echo "Done."
}
trap stop_all EXIT INT TERM

# ── Redis ────────────────────────────────────────────────────────────────────
if command -v redis-server &>/dev/null; then
  if redis-cli ping &>/dev/null 2>&1; then
    echo "[redis]   already running — skipping"
    REDIS_PID=""
  else
    redis-server --daemonize no &>"$LOG_DIR/redis.log" &
    REDIS_PID=$!
    echo "[redis]   started (pid $REDIS_PID) → logs/redis.log"
  fi
else
  echo "[redis]   redis-server not found — assuming it is already running"
  REDIS_PID=""
fi

# ── FastAPI ───────────────────────────────────────────────────────────────────
cd "$BACKEND_DIR"
echo "[api]     starting on http://localhost:8000 → logs/api.log"
uv run uvicorn api.app:app --host 0.0.0.0 --port 8000 --reload \
  &>"$LOG_DIR/api.log" &
API_PID=$!
echo "[api]     pid $API_PID"

# ── Celery worker ─────────────────────────────────────────────────────────────
echo "[worker]  starting (concurrency=2) → logs/worker.log"
uv run celery -A api.celery_app worker --loglevel=info --concurrency=2 \
  &>"$LOG_DIR/worker.log" &
WORKER_PID=$!
echo "[worker]  pid $WORKER_PID"

# ── Celery beat ───────────────────────────────────────────────────────────────
echo "[beat]    starting → logs/beat.log"
uv run celery -A api.celery_app beat --loglevel=info \
  &>"$LOG_DIR/beat.log" &
BEAT_PID=$!
echo "[beat]    pid $BEAT_PID"

echo ""
echo "Backend running. Press Ctrl-C to stop."
wait

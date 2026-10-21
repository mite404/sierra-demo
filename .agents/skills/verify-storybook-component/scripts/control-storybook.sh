#!/usr/bin/env bash
# Launch, check, and stop a Storybook dev server owned by one verification run.
#
# The four `..` in ROOT walk scripts -> verify-storybook-component -> skills -> .agents -> repo root.
# .claude/skills/verify-storybook-component/scripts/ sits at the same depth through its symlink.

set -euo pipefail

# ---------------------------------------------------------------- CONFIG
APP="storybook"
DEFAULT_PORT="${VERIFY_PORT:-6106}"      # not 6006, so a human's `pnpm storybook` keeps its port
READY_PATH="/index.json"                 # the story index; answers once the first build finishes
DOCTOR_NEEDLE="foundations-button--default"   # a story id only this repo's Storybook serves
BOOT_TIMEOUT=90
# ------------------------------------------------------------- END CONFIG

ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
STATE_DIR="${VERIFY_STATE_DIR:-/tmp/yaklabs-${APP}-verify-${VERIFY_RUN_ID:-default}}"
PID_FILE="$STATE_DIR/server.pid"
PORT_FILE="$STATE_DIR/port"
LOG_FILE="$STATE_DIR/dev.log"

mkdir -p "$STATE_DIR"

port_in_use() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }

read_port() { [[ -f "$PORT_FILE" ]] && cat "$PORT_FILE" || echo "$DEFAULT_PORT"; }

cmd_launch() {
  local port="${VERIFY_PORT:-$DEFAULT_PORT}"

  # Refusing beats double-driving: an unowned pid is one nobody can clean up.
  if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "$APP: already running (pid $(cat "$PID_FILE"), port $(read_port))" >&2; exit 1
  fi
  if port_in_use "$port"; then
    echo "$APP: port $port already in use; set VERIFY_PORT to a free port" >&2; exit 1
  fi

  echo "$port" >"$PORT_FILE"
  cd "$ROOT/apps/storybook"
  # A verification run starts from a clean build: the cache once served the catalog as it was in an
  # earlier session, and a before/after comparison then compared the old code with itself.
  rm -rf "$ROOT/apps/storybook/node_modules/.cache/storybook"
  STORYBOOK_DISABLE_TELEMETRY=1 nohup "$ROOT/apps/storybook/node_modules/.bin/storybook" dev \
    -p "$port" --host 127.0.0.1 --ci --no-open >"$LOG_FILE" 2>&1 &
  echo $! >"$PID_FILE"

  for _ in $(seq 1 "$BOOT_TIMEOUT"); do
    if curl -fsS "http://127.0.0.1:${port}${READY_PATH}" 2>/dev/null | grep -q "$DOCTOR_NEEDLE"; then
      echo "$APP: ready at http://127.0.0.1:${port}/ (pid $(cat "$PID_FILE"))"
      echo "$APP: log $LOG_FILE"
      exit 0
    fi
    sleep 1
  done

  echo "$APP: timed out waiting for http://127.0.0.1:${port}${READY_PATH}" >&2
  tail -20 "$LOG_FILE" >&2 || true
  exit 1
}

cmd_doctor() {
  local port pid body
  port="$(read_port)"
  [[ -f "$PID_FILE" ]] || { echo "$APP doctor: FAIL, no pid file at $PID_FILE (run launch first)" >&2; exit 1; }
  pid="$(cat "$PID_FILE")"
  kill -0 "$pid" 2>/dev/null || { echo "$APP doctor: FAIL, pid $pid is not running" >&2; exit 1; }
  port_in_use "$port" || { echo "$APP doctor: FAIL, nothing listening on port $port" >&2; exit 1; }
  body="$(curl -fsS "http://127.0.0.1:${port}${READY_PATH}")" || {
    echo "$APP doctor: FAIL, GET $READY_PATH did not return 200" >&2; exit 1; }

  # A content assertion, not just a 200: proves the port serves this repo's stories.
  grep -q "$DOCTOR_NEEDLE" <<<"$body" || {
    echo "$APP doctor: FAIL, index missing $DOCTOR_NEEDLE (another Storybook owns the port?)" >&2; exit 1; }

  echo "$APP doctor: OK"
  echo "  url: http://127.0.0.1:${port}/"
  echo "  stories: $(grep -o '"type":"story"' <<<"$body" | wc -l | tr -d ' ')"
  echo "  pid: $pid (owned by this run)"
  echo "  log: $LOG_FILE"
}

cmd_stop() {
  [[ -f "$PID_FILE" ]] || { echo "$APP: no pid file, nothing to stop"; exit 0; }
  local pid; pid="$(cat "$PID_FILE")"
  if kill -0 "$pid" 2>/dev/null; then
    # Kill the recorded pid only. Never `pkill storybook` or `killall node`.
    kill "$pid" 2>/dev/null || true
    for _ in $(seq 1 15); do kill -0 "$pid" 2>/dev/null || break; sleep 1; done
    kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null || true
    echo "$APP: stopped pid $pid"
  else
    echo "$APP: pid $pid was not running"
  fi
  rm -f "$PID_FILE"
  # Evidence lives in .artifacts/verify-storybook-component/ and is never removed here.
}

case "${1:-}" in
  launch) cmd_launch ;;
  doctor) cmd_doctor ;;
  stop)   cmd_stop ;;
  *) echo "usage: $(basename "$0") {launch|doctor|stop}" >&2; exit 1 ;;
esac

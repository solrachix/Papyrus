#!/usr/bin/env bash
set -euo pipefail

# Runs the deterministic ADB pinch protocol used by PR14. The duration starts
# after app launch and includes the complete ten-cycle session, including ADB
# injection overhead. This is a paired diagnostic protocol, not perceptual FPS.
APP="${PAPYRUS_ANDROID_APP:-com.papyrus.sdk.mobileexpo}"
DEV="${PAPYRUS_ANDROID_INPUT:-/dev/input/event2}"
SESSIONS="${PAPYRUS_ANDROID_SESSIONS:-5}"

adb shell sh -s -- "$APP" "$DEV" "$SESSIONS" <<'REMOTE'
set -eu
APP=$1; DEV=$2; SESSIONS=$3
OPEN_LEFT=11373
OPEN_RIGHT=22384
STEP=228
STEPS=10
APP_READY_TIMEOUT=10
send() { sendevent "$DEV" "$1" "$2" "$3"; }
sync_mt() { send 0 2 0; }
sync_frame() { send 0 0 0; }
finger() {
  send 3 47 "$1"; send 3 57 "$2"; send 3 53 "$3"; send 3 54 15000
  send 3 48 10; send 3 49 10; send 3 58 50; sync_mt
}
move_pair() { finger 0 100 "$1"; finger 1 101 "$2"; sync_frame; }
end_pair() {
  send 3 47 0; send 3 57 -1; sync_mt
  send 3 47 1; send 3 57 -1; sync_mt; sync_frame
}
gesture_cycle() {
  move_pair "$OPEN_LEFT" "$OPEN_RIGHT"
  i=1
  while [ "$i" -le "$STEPS" ]; do
    move_pair $((OPEN_LEFT - i * STEP)) $((OPEN_RIGHT + i * STEP)); sleep 0.025; i=$((i + 1))
  done
  i=1
  while [ "$i" -le "$STEPS" ]; do
    remaining=$((STEPS - i))
    move_pair $((OPEN_LEFT - remaining * STEP)) $((OPEN_RIGHT + remaining * STEP)); sleep 0.025; i=$((i + 1))
  done
  end_pair; sleep 0.08
}
wait_for_app() {
  elapsed=0
  until pidof "$APP" >/dev/null 2>&1; do
    if [ "$elapsed" -ge "$APP_READY_TIMEOUT" ]; then
      echo "App process did not start within ${APP_READY_TIMEOUT}s" >&2
      exit 1
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done
  # The PDF is bundled, but process readiness precedes its first sharp surface.
  sleep 5
}
session=1
while [ "$session" -le "$SESSIONS" ]; do
  am force-stop "$APP"; monkey -p "$APP" 1 >/dev/null; wait_for_app
  started_at=$(date +%s%3N)
  dumpsys gfxinfo "$APP" reset >/dev/null
  cycle=1
  while [ "$cycle" -le 10 ]; do gesture_cycle; cycle=$((cycle + 1)); done
  sleep 1
  finished_at=$(date +%s%3N)
  duration=$((finished_at - started_at))
  echo "SESSION $session"
  echo "Duration ms: $duration"
  dumpsys gfxinfo "$APP" | grep -E 'Total frames rendered|Janky frames:|90th percentile|95th percentile|Number Missed Vsync'
  session=$((session + 1))
done
REMOTE

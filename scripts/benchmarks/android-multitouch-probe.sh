#!/usr/bin/env bash
set -euo pipefail

device=""
package_id=""
duration_ms=1200
radius=120
center_x=""
center_y=""
direction="out"
mechanism="auto"

while (($#)); do
  case "$1" in
    --device) device=${2:?missing --device value}; shift 2 ;;
    --package) package_id=${2:?missing --package value}; shift 2 ;;
    --duration-ms) duration_ms=${2:?missing --duration-ms value}; shift 2 ;;
    --radius) radius=${2:?missing --radius value}; shift 2 ;;
    --center-x) center_x=${2:?missing --center-x value}; shift 2 ;;
    --center-y) center_y=${2:?missing --center-y value}; shift 2 ;;
    --direction) direction=${2:?missing --direction value}; shift 2 ;;
    --mechanism) mechanism=${2:?missing --mechanism value}; shift 2 ;;
    *) echo "usage: $0 --device SERIAL [--package ID] [--mechanism auto|emulator|protocol-b|helper]" >&2; exit 2 ;;
  esac
done

if [[ -z "$device" ]]; then echo "--device is required" >&2; exit 2; fi
if [[ "$mechanism" != auto && "$mechanism" != emulator && "$mechanism" != protocol-b && "$mechanism" != helper ]]; then
  echo "--mechanism must be auto, emulator, protocol-b or helper" >&2
  exit 2
fi
adb=(adb -s "$device")
screen=$(${adb[@]} shell wm size | sed -n 's/.*Physical size: //p' | tail -1)
width=${screen%x*}; height=${screen#*x}
if [[ -z "$width" || -z "$height" || "$width" == "$screen" ]]; then echo "unable to discover device size" >&2; exit 1; fi
center_x=${center_x:-$((width / 2))}
center_y=${center_y:-$((height / 2))}
if [[ "$direction" == out ]]; then start_radius=$((radius / 2)); end_radius=$radius
elif [[ "$direction" == in ]]; then start_radius=$radius; end_radius=$((radius / 2))
else echo "--direction must be out or in" >&2; exit 2; fi
x1=$((center_x - start_radius)); x2=$((center_x + start_radius))
y1=$center_y; y2=$center_y

events=$(${adb[@]} shell getevent -lp)
event_device=$(printf '%s\n' "$events" | awk '/add device/ { current=$NF } /ABS_MT_SLOT/ && current != "" { print current; exit }')
touch_x_max=$(printf '%s\n' "$events" | sed -n 's/.*ABS_MT_POSITION_X.*max \([0-9][0-9]*\).*/\1/p' | head -1)
touch_y_max=$(printf '%s\n' "$events" | sed -n 's/.*ABS_MT_POSITION_Y.*max \([0-9][0-9]*\).*/\1/p' | head -1)
touch_x_max=${touch_x_max:-$((width - 1))}
touch_y_max=${touch_y_max:-$((height - 1))}

map_touch_x() { echo $(( $1 * touch_x_max / (width - 1) )); }
map_touch_y() { echo $(( $1 * touch_y_max / (height - 1) )); }

run_helper() {
  local helper=${PAPYRUS_MULTITOUCH_HELPER:-}
  if [[ -z "$helper" || ! -x "$helper" ]]; then return 1; fi
  echo "multitouch mechanism=helper helper=$helper${package_id:+ package=$package_id}" >&2
  "$helper" --device "$device" --duration-ms "$duration_ms" --radius "$radius" \
    --center-x "$center_x" --center-y "$center_y" --direction "$direction"
}

run_emulator_console() {
  local help
  help=$(${adb[@]} emu help 2>/dev/null || true)
  if ! printf '%s\n' "$help" | rg -q '(^|[[:space:]])event([[:space:]]|$)'; then return 1; fi
  echo "multitouch mechanism=emulator-console" >&2
  event_send() { ${adb[@]} emu event send "$1"; }
  event_send "EV_SYN:0:0" >/dev/null
  cleanup() {
    event_send "EV_ABS:ABS_MT_SLOT:0" || true; event_send "EV_ABS:ABS_MT_TRACKING_ID:-1" || true
    event_send "EV_ABS:ABS_MT_SLOT:1" || true; event_send "EV_ABS:ABS_MT_TRACKING_ID:-1" || true
    event_send "EV_KEY:BTN_TOUCH:0" || true
    event_send "EV_SYN:0:0" || true
  }
  trap cleanup EXIT INT TERM
  event_send "EV_KEY:BTN_TOUCH:1"
  event_send "EV_ABS:ABS_MT_SLOT:0"; event_send "EV_ABS:ABS_MT_TRACKING_ID:1001"
  event_send "EV_ABS:ABS_MT_TOUCH_MAJOR:10"; event_send "EV_ABS:ABS_MT_PRESSURE:100"
  event_send "EV_ABS:ABS_MT_POSITION_X:$(map_touch_x "$x1")"; event_send "EV_ABS:ABS_MT_POSITION_Y:$(map_touch_y "$y1")"
  event_send "EV_ABS:ABS_MT_SLOT:1"; event_send "EV_ABS:ABS_MT_TRACKING_ID:1002"
  event_send "EV_ABS:ABS_MT_TOUCH_MAJOR:10"; event_send "EV_ABS:ABS_MT_PRESSURE:100"
  event_send "EV_ABS:ABS_MT_POSITION_X:$(map_touch_x "$x2")"; event_send "EV_ABS:ABS_MT_POSITION_Y:$(map_touch_y "$y2")"
  event_send "EV_SYN:0:0"
  steps=$((duration_ms / 40)); ((steps < 1)) && steps=1
  for ((step = 1; step <= steps; step += 1)); do
    offset=$((start_radius + ((end_radius - start_radius) * step / steps)))
    event_send "EV_ABS:ABS_MT_SLOT:0"; event_send "EV_ABS:ABS_MT_POSITION_X:$(map_touch_x "$((center_x - offset))")"; event_send "EV_ABS:ABS_MT_POSITION_Y:$(map_touch_y "$y1")"
    event_send "EV_ABS:ABS_MT_SLOT:1"; event_send "EV_ABS:ABS_MT_POSITION_X:$(map_touch_x "$((center_x + offset))")"; event_send "EV_ABS:ABS_MT_POSITION_Y:$(map_touch_y "$y2")"
    event_send "EV_SYN:0:0"
    ${adb[@]} shell sleep 0.04
  done
  return 0
}

run_protocol_b() {
  if [[ -z "$event_device" ]]; then return 1; fi
  if ! ${adb[@]} shell test -w "$event_device" >/dev/null 2>&1; then return 1; fi
  echo "multitouch mechanism=protocol-b device=$event_device" >&2
  local x_max y_max
  x_max=$(printf '%s\n' "$events" | sed -n 's/.*ABS_MT_POSITION_X.*max \([0-9][0-9]*\).*/\1/p' | head -1)
  y_max=$(printf '%s\n' "$events" | sed -n 's/.*ABS_MT_POSITION_Y.*max \([0-9][0-9]*\).*/\1/p' | head -1)
  x_max=${x_max:-$((width - 1))}; y_max=${y_max:-$((height - 1))}
  local screen_x1=$x1 screen_x2=$x2 screen_y1=$y1 screen_y2=$y2
  map_x() { echo $(( $1 * x_max / (width - 1) )); }
  map_y() { echo $(( $1 * y_max / (height - 1) )); }
  x1=$(map_x "$screen_x1"); x2=$(map_x "$screen_x2")
  y1=$(map_y "$screen_y1"); y2=$(map_y "$screen_y2")
  send() { ${adb[@]} shell sendevent "$event_device" "$1" "$2" "$3"; }
  cleanup() {
    send 3 47 0 || true; send 3 57 -1 || true
    send 3 47 1 || true; send 3 57 -1 || true
    send 1 330 0 || true
    send 0 0 0 || true
  }
  trap cleanup EXIT INT TERM
  send 1 330 1
  send 3 47 0; send 3 57 1001; send 3 48 10; send 3 58 100; send 3 53 "$x1"; send 3 54 "$y1"
  send 3 47 1; send 3 57 1002; send 3 48 10; send 3 58 100; send 3 53 "$x2"; send 3 54 "$y2"
  send 0 0 0
  steps=$((duration_ms / 40)); ((steps < 1)) && steps=1
  for ((step = 1; step <= steps; step += 1)); do
    offset=$((start_radius + ((end_radius - start_radius) * step / steps)))
    current_x1=$((center_x - offset)); current_x2=$((center_x + offset))
    current_x1=$(map_x "$current_x1"); current_x2=$(map_x "$current_x2")
    send 3 47 0; send 3 53 "$current_x1"; send 3 54 "$(map_y "$screen_y1")"
    send 3 47 1; send 3 53 "$current_x2"; send 3 54 "$(map_y "$screen_y2")"
    send 0 0 0
    ${adb[@]} shell sleep 0.04
  done
}

if [[ "$mechanism" == emulator ]]; then run_emulator_console || { echo "emulator console event injector unavailable" >&2; exit 1; }
elif [[ "$mechanism" == protocol-b ]]; then run_protocol_b || { echo "Protocol B injector unavailable" >&2; exit 1; }
elif [[ "$mechanism" == helper ]]; then run_helper || { echo "PAPYRUS_MULTITOUCH_HELPER is not executable" >&2; exit 1; }
else
  run_emulator_console || run_protocol_b || run_helper || {
    echo "no real multipointer injector available (emulator console, Protocol B or helper)" >&2
    exit 1
  }
fi

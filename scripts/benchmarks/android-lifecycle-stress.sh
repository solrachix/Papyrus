#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: android-lifecycle-stress.sh --device SERIAL --scenario NAME --cycles N --package ID --output-dir DIR [options]

Options:
  --fixture NAME   PDF fixture for scenarios that open a PDF (default: small)
  --perf 0|1       Enable runtime diagnostics (default: 0)
EOF
}

device=''
scenario=''
cycles=''
package_id='com.papyrus.sdk.mobileexpo'
fixture='small'
perf='0'
output_dir=''

while (($#)); do
  case "$1" in
    --device) device="$2"; shift 2 ;;
    --scenario) scenario="$2"; shift 2 ;;
    --cycles) cycles="$2"; shift 2 ;;
    --package) package_id="$2"; shift 2 ;;
    --output-dir) output_dir="$2"; shift 2 ;;
    --fixture) fixture="$2"; shift 2 ;;
    --perf) perf="$2"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) echo "unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ -z "$device" || -z "$scenario" || -z "$cycles" || -z "$output_dir" ]]; then
  echo 'device, scenario, cycles and output-dir are required' >&2
  usage >&2
  exit 2
fi
if ! [[ "$cycles" =~ ^[0-9]+$ ]] || ((cycles < 1)); then
  echo 'cycles must be a positive integer' >&2
  exit 2
fi
if [[ "$perf" != '0' && "$perf" != '1' ]]; then
  echo 'perf must be 0 or 1' >&2
  exit 2
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../.." && pwd)"
mkdir -p "$output_dir"
: > "$output_dir/checkpoints.ndjson"
: > "$output_dir/failures.txt"

adb_cmd=(adb -s "$device")
if [[ "$device" != 'emulator-5554' ]]; then
  echo "refusing non-approved device: $device" >&2
  exit 3
fi
if [[ "${#adb_cmd[@]}" -eq 0 ]] || [[ "$(${adb_cmd[@]} get-state 2>/dev/null || true)" != 'device' ]]; then
  echo "device is not ready: $device" >&2
  exit 3
fi

mem_value() {
  local pattern="$1"
  local file="$2"
  awk -v pattern="$pattern" '$0 ~ pattern { for (i = 1; i <= NF; i++) if ($i ~ /^[0-9]+$/) { print $i; exit } }' "$file" 2>/dev/null || true
}

object_count() {
  local label="$1"
  local file="$2"
  awk -v label="$label" '{ for (i = 1; i <= NF; i++) if ($i == label) { print $(i + 1); exit } }' "$file" 2>/dev/null || true
}

json_number_or_null() {
  local value="${1:-}"
  if [[ "$value" =~ ^[0-9]+([.][0-9]+)?$ ]]; then
    printf '%s' "$value"
  else
    printf 'null'
  fi
}

wait_for_pdf_surface() {
  local xml="$output_dir/wait-ui.xml"
  local attempt
  for attempt in $(seq 1 45); do
    "${adb_cmd[@]}" shell uiautomator dump /sdcard/pr28-ui.xml >/dev/null 2>&1 || true
    "${adb_cmd[@]}" exec-out cat /sdcard/pr28-ui.xml > "$xml" 2>/dev/null || true
    if rg -q 'papyrus-page-1|PDF|Pag' "$xml" 2>/dev/null; then
      return 0
    fi
    sleep 1
  done
  echo "surface timeout for $fixture" >> "$output_dir/failures.txt"
  return 1
}

capture_checkpoint() {
  local cycle="$1"
  local label="$2"
  local dir="$output_dir/cycle-${cycle}-${label}"
  mkdir -p "$dir"
  "${adb_cmd[@]}" shell dumpsys meminfo "$package_id" > "$dir/meminfo.txt" 2>&1 || true
  "${adb_cmd[@]}" shell dumpsys gfxinfo "$package_id" > "$dir/gfxinfo.txt" 2>&1 || true
  "${adb_cmd[@]}" shell pidof "$package_id" > "$dir/pid.txt" 2>&1 || true
  "${adb_cmd[@]}" shell uiautomator dump /sdcard/pr28-ui.xml >/dev/null 2>&1 || true
  "${adb_cmd[@]}" exec-out cat /sdcard/pr28-ui.xml > "$dir/ui.xml" 2>/dev/null || true
  "${adb_cmd[@]}" logcat -d -v brief -t 250 > "$dir/logcat.txt" 2>&1 || true
  rg 'papyrus|Papyrus|render\.|engine\.|surface\.' "$dir/logcat.txt" > "$dir/events.txt" 2>/dev/null || true

  local total_pss native_heap java_heap graphics attached_views activities web_views pid
  total_pss="$(mem_value '^[[:space:]]*TOTAL PSS:' "$dir/meminfo.txt")"
  native_heap="$(mem_value '^[[:space:]]*Native Heap:' "$dir/meminfo.txt")"
  java_heap="$(mem_value '^[[:space:]]*Java Heap:' "$dir/meminfo.txt")"
  graphics="$(mem_value '^[[:space:]]*Graphics:' "$dir/meminfo.txt")"
  attached_views="$( (rg -o 'papyrus-page-[0-9]+' "$dir/ui.xml" 2>/dev/null || true) | sort -u | wc -l | tr -d ' ')"
  activities="$(object_count 'Activities:' "$dir/meminfo.txt")"
  web_views="$(object_count 'WebViews:' "$dir/meminfo.txt")"
  pid="$(tr -d '[:space:]' < "$dir/pid.txt" || true)"

  cat >> "$output_dir/checkpoints.ndjson" <<EOF
{"cycle":$cycle,"label":"$label","totalPssKb":$(json_number_or_null "$total_pss"),"nativeHeapKb":$(json_number_or_null "$native_heap"),"javaHeapKb":$(json_number_or_null "$java_heap"),"graphicsKb":$(json_number_or_null "$graphics"),"resources":{"attachedViews":$(json_number_or_null "$attached_views"),"activities":$(json_number_or_null "$activities"),"webViews":$(json_number_or_null "$web_views")},"pid":$(if [[ "$pid" =~ ^[0-9]+$ ]]; then printf '%s' "$pid"; else printf 'null'; fi)}
EOF
}

start_pdf() {
  local selected_fixture="$1"
  "${adb_cmd[@]}" shell am force-stop "$package_id"
  "${adb_cmd[@]}" logcat -c
  local uri="exp+papyrus-sdk://reader?fixture=${selected_fixture}&viewerMode=compat&perf=${perf}&runId=pr28-${scenario}&sampleId=${scenario}-${selected_fixture}"
  "${adb_cmd[@]}" shell am start -W -a android.intent.action.VIEW -d "$uri" "$package_id" > "$output_dir/start-${selected_fixture}.txt" 2>&1 || true
  wait_for_pdf_surface || true
}

start_pdf_unwaited() {
  local selected_fixture="$1"
  "${adb_cmd[@]}" shell am force-stop "$package_id"
  "${adb_cmd[@]}" logcat -c
  local uri="exp+papyrus-sdk://reader?fixture=${selected_fixture}&viewerMode=compat&perf=${perf}&runId=pr28-${scenario}&sampleId=${scenario}-${selected_fixture}"
  "${adb_cmd[@]}" shell am start -W -a android.intent.action.VIEW -d "$uri" "$package_id" > "$output_dir/start-${selected_fixture}-unwaited.txt" 2>&1 || true
}

tap_format() {
  local format="$1"
  case "$format" in
    pdf) "${adb_cmd[@]}" shell input tap 90 190 || true ;;
    epub) "${adb_cmd[@]}" shell input tap 238 190 || true ;;
    text) "${adb_cmd[@]}" shell input tap 390 190 || true ;;
    *) echo "unknown format $format" >&2; return 2 ;;
  esac
  sleep 2
}

scroll_short() {
  "${adb_cmd[@]}" shell input swipe 360 1450 360 420 700 >/dev/null || true
  "${adb_cmd[@]}" shell input swipe 360 1450 360 420 700 >/dev/null || true
  "${adb_cmd[@]}" shell input swipe 360 420 360 1450 700 >/dev/null || true
  sleep 1
}

background_foreground() {
  "${adb_cmd[@]}" shell input keyevent HOME
  sleep 1
  "${adb_cmd[@]}" shell monkey -p "$package_id" 1 >/dev/null 2>&1 || true
  sleep 2
}

rotate_round_trip() {
  local previous
  previous="$("${adb_cmd[@]}" shell settings get system user_rotation | tr -d '[:space:]')"
  "${adb_cmd[@]}" shell settings put system accelerometer_rotation 0
  "${adb_cmd[@]}" shell settings put system user_rotation 1
  sleep 2
  "${adb_cmd[@]}" shell settings put system user_rotation 0
  sleep 2
  if [[ "$previous" =~ ^[01]$ ]]; then
    "${adb_cmd[@]}" shell settings put system user_rotation "$previous"
  fi
}

checkpoint_if_needed() {
  local cycle="$1"
  if ((cycle == 0 || cycle == 1 || cycle == 5 || cycle == 10 || cycle == 20 || cycle == cycles)); then
    capture_checkpoint "$cycle" "checkpoint"
  fi
}

initial_fixture="$fixture"
case "$scenario" in
  large-reopen|background-render|switch-during-render|reverse-navigation) initial_fixture='large-1000' ;;
  long) initial_fixture='large-100' ;;
esac
start_pdf "$initial_fixture"
capture_checkpoint 0 initial

for cycle in $(seq 1 "$cycles"); do
  case "$scenario" in
    reopen-small)
      start_pdf small
      ;;
    small-large)
      start_pdf small
      start_pdf large-100
      ;;
    large-reopen)
      start_pdf large-1000
      scroll_short
      ;;
    cross-format)
      tap_format text
      tap_format epub
      tap_format pdf
      tap_format text
      tap_format epub
      ;;
    background)
      background_foreground
      ;;
    background-render)
      start_pdf_unwaited large-1000
      background_foreground
      ;;
    switch-during-render)
      start_pdf_unwaited large-1000
      sleep 1
      tap_format text
      ;;
    reverse-navigation)
      start_pdf large-1000
      scroll_short
      start_pdf small
      start_pdf large-1000
      ;;
    orientation)
      rotate_round_trip
      ;;
    long)
      start_pdf large-100
      scroll_short
      tap_format text
      tap_format epub
      tap_format pdf
      background_foreground
      rotate_round_trip
      ;;
    *)
      echo "unsupported scenario: $scenario" >&2
      exit 2
      ;;
  esac
  checkpoint_if_needed "$cycle"
done

"${adb_cmd[@]}" logcat -d -v brief -t 1000 > "$output_dir/logcat-final.txt" 2>&1 || true
rg -i 'FATAL EXCEPTION|ANR|OutOfMemoryError|recycled bitmap|IllegalStateException|WindowLeaked|papyrus_render_error' "$output_dir" >> "$output_dir/failures.txt" 2>/dev/null || true
printf '%s\n' "$scenario" > "$output_dir/scenario.txt"
printf '%s\n' "$fixture" > "$output_dir/fixture.txt"
printf '%s\n' "$device" > "$output_dir/device.txt"
printf '%s\n' "$perf" > "$output_dir/perf.txt"

node "$repo_root/scripts/benchmarks/android-lifecycle-stress-aggregate.mjs" \
  "$output_dir/checkpoints.ndjson" "$output_dir/aggregate.json" \
  --scenario "$scenario" --warmup-cycles 1

echo "completed: $scenario cycles=$cycles output=$output_dir"

#!/usr/bin/env bash
set -euo pipefail

fixtures=""
runs=1
package_id=""
device=""
output_dir="${TMPDIR:-/tmp}/papyrus-pr25-android-scroll"
perf=1

while (($#)); do
  case "$1" in
    --fixture) fixtures=${2:?missing --fixture value}; shift 2 ;;
    --runs) runs=${2:?missing --runs value}; shift 2 ;;
    --package) package_id=${2:?missing --package value}; shift 2 ;;
    --device) device=${2:?missing --device value}; shift 2 ;;
    --output-dir) output_dir=${2:?missing --output-dir value}; shift 2 ;;
    --perf) perf=${2:?missing --perf value}; shift 2 ;;
    *) echo "usage: $0 --fixture NAME[,NAME...]|all --runs N --perf 0|1 --package ID [--device SERIAL] [--output-dir DIR]" >&2; exit 2 ;;
  esac
done

if [[ -z "$fixtures" || -z "$package_id" || ! "$runs" =~ ^[1-9][0-9]*$ || "$perf" != 0 && "$perf" != 1 ]]; then
  echo "--fixture, --runs, --package and --perf 0|1 are required" >&2
  exit 2
fi

if [[ -z "$device" ]]; then
  mapfile -t connected < <(adb devices | awk '$2 == "device" { print $1 }')
  if ((${#connected[@]} != 1)); then
    echo "without --device exactly one adb device is required" >&2
    exit 1
  fi
  device=${connected[0]}
else
  adb -s "$device" get-state >/dev/null
fi

if [[ "$fixtures" == all ]]; then
  fixtures="small,large-100,large-1000,varied-sizes"
fi

mkdir -p "$output_dir"
IFS=',' read -r -a fixture_list <<< "$fixtures"

wait_for_log() {
  local pattern=$1
  local timeout=${2:-60}
  local elapsed=0
  while ((elapsed < timeout)); do
    if adb -s "$device" logcat -d -v brief | rg -q "$pattern"; then
      return 0
    fi
    sleep 1
    ((elapsed += 1))
  done
  return 1
}

wait_for_initial_render() {
  local fixture=$1
  local timeout=60
  local elapsed=0
  local minimum=6
  [[ "$fixture" == small ]] && minimum=1
  [[ "$fixture" == varied-sizes ]] && minimum=4
  while ((elapsed < timeout)); do
    local ready_count
    ready_count=$(adb -s "$device" logcat -d -v brief | rg -c '"name":"render.ready"' || true)
    if [[ "${ready_count:-}" =~ ^[0-9]+$ ]] && ((ready_count >= minimum)); then
      return 0
    fi
    sleep 1
    ((elapsed += 1))
  done
  return 1
}

start_fixture() {
  local fixture=$1
  local run_id=$2
  local sample_id=$3
  local url="exp+papyrus-sdk://reader?fixture=${fixture}&viewerMode=compat&perf=${perf}&runId=${run_id}&sampleId=${sample_id}"
  local escaped_url="${url//&/\\&}"
  adb -s "$device" shell am force-stop "$package_id"
  adb -s "$device" logcat -c
  adb -s "$device" shell am start -W -a android.intent.action.VIEW -d "$escaped_url" "$package_id" >/dev/null
  if ((perf == 1)); then
    wait_for_log "fixture.loaded.*${fixture}" 90
    wait_for_initial_render "$fixture"
  else
    sleep 5
  fi
}

for fixture in "${fixture_list[@]}"; do
  for ((run = 1; run <= runs; run += 1)); do
    run_id="pr25-${fixture}-${run}-$(date +%s)"
    sample_id="${run_id}-sample"
    sample_dir="$output_dir/$fixture/$run"
    mkdir -p "$sample_dir"

    start_fixture "$fixture" "$run_id" "$sample_id"
    adb -s "$device" shell dumpsys gfxinfo "$package_id" reset >/dev/null
    for swipe in 1 2 3 4; do
      adb -s "$device" shell input swipe 540 1900 540 650 600
      sleep 0.3
    done
    adb -s "$device" shell screencap -p > "$sample_dir/screenshot.png"
    adb -s "$device" shell dumpsys gfxinfo "$package_id" > "$sample_dir/gfxinfo.txt"
    adb -s "$device" shell dumpsys meminfo "$package_id" > "$sample_dir/meminfo.txt"
    adb -s "$device" logcat -d -v brief > "$sample_dir/logcat.txt"
    sed -n 's/.*\[Papyrus Perf\] //p' "$sample_dir/logcat.txt" > "$sample_dir/events.ndjson"
    sed -n 's/.*\[Papyrus Native Perf\] //p' "$sample_dir/logcat.txt" > "$sample_dir/native-events.ndjson"
    if ((perf == 1)); then
      node "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/scripts/benchmarks/android-native-render-aggregate.mjs" \
        "$sample_dir/native-events.ndjson" "$sample_dir/native-render.json"
    fi
    printf '%s\n' \
      "fixture=$fixture" \
      "run=$run" \
      "device=$device" \
      "perf=$perf" \
      "viewerMode=compat" \
      "scrollProtocol=4x vertical swipe" \
      > "$sample_dir/metadata.txt"
    echo "${fixture} run ${run}: collected"
  done
done

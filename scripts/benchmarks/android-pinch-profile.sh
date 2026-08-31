#!/usr/bin/env bash
set -euo pipefail

fixtures=""
runs=5
package_id=""
device=""
output_dir="${TMPDIR:-/tmp}/papyrus-pr15-android"
probe_dir="$(cd "$(dirname "$0")" && pwd)"

while (($#)); do
  case "$1" in
    --fixture) fixtures=${2:?missing --fixture value}; shift 2 ;;
    --runs) runs=${2:?missing --runs value}; shift 2 ;;
    --package) package_id=${2:?missing --package value}; shift 2 ;;
    --device) device=${2:?missing --device value}; shift 2 ;;
    --output-dir) output_dir=${2:?missing --output-dir value}; shift 2 ;;
    *) echo "usage: $0 --fixture NAME[,NAME...]|all --runs N --package ID [--device SERIAL]" >&2; exit 2 ;;
  esac
done
if [[ -z "$fixtures" || -z "$package_id" || ! "$runs" =~ ^[1-9][0-9]*$ ]]; then echo "--fixture, --runs and --package are required" >&2; exit 2; fi

if [[ -z "$device" ]]; then
  mapfile -t connected < <(adb devices | awk '$2 == "device" { print $1 }')
  if ((${#connected[@]} != 1)); then echo "without --device exactly one adb device is required" >&2; exit 1; fi
  device=${connected[0]}
else
  adb -s "$device" get-state >/dev/null
fi

if [[ "$fixtures" == all ]]; then fixtures="small,large-100,large-1000,varied-sizes"; fi
mkdir -p "$output_dir"
IFS=',' read -r -a fixture_list <<< "$fixtures"

wait_for_log() {
  local pattern=$1; local timeout=${2:-60}; local elapsed=0
  while ((elapsed < timeout)); do
    if adb -s "$device" logcat -d -v brief | rg -q "$pattern"; then return 0; fi
    sleep 1; ((elapsed += 1))
  done
  return 1
}

start_fixture() {
  local fixture=$1; local run_id=$2; local sample_id=$3
  adb -s "$device" shell am force-stop "$package_id"
  adb -s "$device" logcat -c
  adb -s "$device" shell am start -W -a android.intent.action.VIEW \
    -d "exp+papyrus-sdk://reader?fixture=${fixture}\&runId=${run_id}\&sampleId=${sample_id}\&perf=1\&viewerMode=compat" "$package_id" >/dev/null
  wait_for_log 'fixture.loaded' 90
}

for fixture in "${fixture_list[@]}"; do
  for direction in out in; do
    for ((run = 1; run <= runs; run += 1)); do
      run_id="pr15-${fixture}-${direction}-${run}-$(date +%s)"
      warm_id="${run_id}-warmup"
      sample_id="${run_id}-sample"
      start_fixture "$fixture" "$run_id" "$warm_id"
      "$probe_dir/android-multitouch-probe.sh" --device "$device" --duration-ms 350 --radius 60 --direction "$direction"
      start_fixture "$fixture" "$run_id" "$sample_id"
      sample_dir="$output_dir/$fixture/$direction/$run"
      mkdir -p "$sample_dir"
      gfx_window_start_ms="$(date +%s%3N)"
      adb -s "$device" shell dumpsys gfxinfo "$package_id" reset >/dev/null
      "$probe_dir/android-multitouch-probe.sh" --device "$device" --duration-ms 1200 --radius 120 --direction "$direction" >/dev/null
      wait_for_log 'preview.cleared' 90
      adb -s "$device" logcat -d -v brief | sed -n 's/.*\[Papyrus Perf\] //p' > "$sample_dir/events.ndjson"
      adb -s "$device" shell dumpsys gfxinfo "$package_id" > "$sample_dir/gfxinfo.txt"
      gfx_window_end_ms="$(date +%s%3N)"
      gfx_window_duration_ms=$((gfx_window_end_ms - gfx_window_start_ms))
      printf '%s\n' "fixture=$fixture direction=$direction run=$run device=$device gfxWindowDurationMs=$gfx_window_duration_ms" > "$sample_dir/metadata.txt"
    done
  done
done

minimum_valid=$((runs > 1 ? runs - 1 : 1))
node "$probe_dir/android-pinch-aggregate.mjs" "$output_dir" \
  --fixtures "$fixtures" --min-valid "$minimum_valid" > "$output_dir/report.json"

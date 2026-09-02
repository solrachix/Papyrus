#!/usr/bin/env bash
set -euo pipefail

fixture=""
package_id=""
device=""
output_dir="${TMPDIR:-/tmp}/papyrus-pr27-ui-thread-trace"
trace_enabled=1
trace_duration_s=30
runs=1

while (($#)); do
  case "$1" in
    --fixture) fixture=${2:?missing --fixture value}; shift 2 ;;
    --package) package_id=${2:?missing --package value}; shift 2 ;;
    --device) device=${2:?missing --device value}; shift 2 ;;
    --output-dir) output_dir=${2:?missing --output-dir value}; shift 2 ;;
    --trace) trace_enabled=${2:?missing --trace value}; shift 2 ;;
    --duration) trace_duration_s=${2:?missing --duration value}; shift 2 ;;
    --runs) runs=${2:?missing --runs value}; shift 2 ;;
    *) echo "usage: $0 --fixture NAME --package ID --device SERIAL --output-dir DIR [--runs N] [--trace 0|1] [--duration SECONDS]" >&2; exit 2 ;;
  esac
done

if [[ -z "$fixture" || -z "$package_id" || -z "$device" || ! "$trace_enabled" =~ ^[01]$ || ! "$trace_duration_s" =~ ^[1-9][0-9]*$ || ! "$runs" =~ ^[1-9][0-9]*$ ]]; then
  echo "--fixture, --package, --device, --runs, --trace 0|1 and positive --duration are required" >&2
  exit 2
fi

mkdir -p "$output_dir"

profile_output="$output_dir/profile"
trace_key="papyrus-pr27-${fixture}-$$"
trace_remote="/data/misc/perfetto-traces/${trace_key}.pftrace"
trace_local="$output_dir/${fixture}.pftrace"
trace_active=0

stop_trace() {
  if ((trace_active == 1)); then
    adb -s "$device" shell perfetto --attach="$trace_key" --stop >/dev/null || true
    trace_active=0
  fi
}

trap stop_trace EXIT

if ((trace_enabled == 1)); then
  printf '%s\n' \
    'buffers { size_kb: 32768 fill_policy: RING_BUFFER }' \
    'data_sources { config { name: "linux.ftrace" ftrace_config {' \
    '  ftrace_events: "sched/sched_switch"' \
    '  ftrace_events: "sched/sched_wakeup"' \
    '  ftrace_events: "sched/sched_wakeup_new"' \
    '  ftrace_events: "power/cpu_frequency"' \
    '  atrace_categories: "app"' \
    '  atrace_categories: "gfx"' \
    '  atrace_categories: "view"' \
    '  atrace_categories: "input"' \
    '  atrace_categories: "binder_driver"' \
    '  atrace_categories: "memory"' \
    '  atrace_categories: "dalvik"' \
    '} } }' \
    'data_sources { config { name: "track_event" track_event_config {' \
    '  enabled_categories: "android.view"' \
    '  enabled_categories: "android.input"' \
    '  enabled_categories: "view"' \
    '} } }' \
    "duration_ms: $((trace_duration_s * 1000))" \
    'write_into_file: true' \
    'file_write_period_ms: 250' \
    | adb -s "$device" shell perfetto --txt -c - -o "$trace_remote" --detach="$trace_key" \
    > "$output_dir/trace-start.txt"
  trace_active=1
fi

bash "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/android-scroll-profile.sh" \
  --fixture "$fixture" \
  --runs "$runs" \
  --perf 1 \
  --package "$package_id" \
  --device "$device" \
  --output-dir "$profile_output"

if ((trace_enabled == 1)); then
  stop_trace
  adb -s "$device" pull "$trace_remote" "$trace_local" >/dev/null
  echo "trace=$trace_local"
fi

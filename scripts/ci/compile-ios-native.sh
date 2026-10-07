#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Native iOS compilation requires macOS and Xcode." >&2
  exit 1
fi
command -v xcodebuild >/dev/null
command -v pod >/dev/null

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
output_root="${PAPYRUS_IOS_COMPILE_OUTPUT_DIR:-${TMPDIR:-/tmp}/papyrus-ios-compile}"
mkdir -p "$output_root"
run_dir="$(mktemp -d "$output_root/run-XXXXXX")"
echo "Native compile logs: $run_dir"

cd "$repo_root/examples/mobile/ios"
RCT_NEW_ARCH_ENABLED=0 pod install 2>&1 | tee "$run_dir/pod-install.log"

# Compile and link the example against workspace sources, including libarchive.
# This is an unsigned compile check, with no archive, IPA, or store submission.
SKIP_BUNDLING=1 RCT_NEW_ARCH_ENABLED=0 xcodebuild \
  -workspace PapyrusMobile.xcworkspace \
  -scheme PapyrusMobile \
  -configuration Debug \
  -destination 'generic/platform=iOS' \
  -derivedDataPath "$run_dir/DerivedData" \
  -resultBundlePath "$run_dir/compile.xcresult" \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  COMPILER_INDEX_STORE_ENABLE=NO \
  build 2>&1 | tee "$run_dir/xcodebuild.log"

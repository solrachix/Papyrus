#!/usr/bin/env bash
set -euo pipefail

PROFILE_PATH="${1:-}"
BUNDLE_ID="${2:-}"
EXPORT_METHOD="${3:-ad-hoc}"
TEAM_ID="${4:-}"

if [[ -z "$PROFILE_PATH" || -z "$BUNDLE_ID" ]]; then
  echo "Usage: ios-export-options.sh <profile.mobileprovision> <bundle_id> [method] [team_id]"
  exit 1
fi

PROFILE_PLIST="$RUNNER_TEMP/profile.plist"
security cms -D -i "$PROFILE_PATH" > "$PROFILE_PLIST"
PROFILE_NAME=$(/usr/libexec/PlistBuddy -c "Print :Name" "$PROFILE_PLIST")

cat > "$RUNNER_TEMP/ExportOptions.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>${EXPORT_METHOD}</string>
  <key>signingStyle</key>
  <string>manual</string>
  <key>teamID</key>
  <string>${TEAM_ID}</string>
  <key>provisioningProfiles</key>
  <dict>
    <key>${BUNDLE_ID}</key>
    <string>${PROFILE_NAME}</string>
  </dict>
</dict>
</plist>
EOF

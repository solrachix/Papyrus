#!/usr/bin/env bash
set -euo pipefail

bump="${1:-patch}"

packages=(
  "packages/types"
  "packages/core"
  "packages/engine-epub"
  "packages/engine-text"
  "packages/engine-pdfjs"
  "packages/engine-native"
  "packages/ui-react"
  "packages/ui-react-native"
  "packages/expo-plugin"
)

for pkg in "${packages[@]}"; do
  echo "Bumping ${pkg} (${bump})"
  npm version "${bump}" --no-git-tag-version --prefix "${pkg}" >/dev/null
done

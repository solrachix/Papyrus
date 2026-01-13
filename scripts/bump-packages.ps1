param(
  [string]$Bump = "patch"
)

$packages = @(
  "packages/types",
  "packages/core",
  "packages/engine-epub",
  "packages/engine-text",
  "packages/engine-pdfjs",
  "packages/engine-native",
  "packages/ui-react",
  "packages/ui-react-native",
  "packages/expo-plugin"
)

foreach ($pkg in $packages) {
  Write-Host "Bumping $pkg ($Bump)"
  npm version $Bump --no-git-tag-version --prefix $pkg | Out-Null
}

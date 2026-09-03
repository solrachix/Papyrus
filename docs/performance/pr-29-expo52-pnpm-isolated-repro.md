# PR29 — Expo 52 / pnpm isolated Android release build reproducibility

## Scope

This PR fixes release-build reproducibility for `examples/mobile-expo`, which
uses Expo SDK 52 and React Native 0.76 in a workspace that keeps pnpm's
isolated linker. It does not change reader behavior or any PDF/EPUB runtime.

## Root cause

The Expo 52 Metro configuration had disabled hierarchical lookup while exposing
only the project and repository `node_modules` directories. With pnpm's
isolated layout, Expo's config/preset packages and the dependencies of the
workspace packages were therefore invisible to Metro. The same workspace also
contains an RN 0.81 example, so falling back to the virtual store without
pinning the Expo example's project modules could make Metro parse RN 0.81
syntax with the Expo 52 parser.

## Fix

- Keep `node-linker=isolated`.
- Publicly hoist only the Expo 52 config/preset runtime packages that Metro
  resolves from the example root: `expo-*`, `babel-preset-expo`, and
  `@babel/runtime`.
- Add pnpm's virtual-store module directory to Metro's deterministic lookup
  paths for correctly declared transitive dependencies.
- Keep hierarchical lookup disabled so the RN 0.76 example cannot inherit the
  RN 0.81 dependency tree from another workspace package.
- Preserve `pdf`, `epub`, and `html` as custom asset extensions.
- Add `scripts/verify-mobile-expo-resolution.mjs`, which checks the linker,
  required resolution, RN 0.76 selection, Metro paths, and the generated Expo
  autolinking namespace.

## Reproducible procedure

From a clean checkout:

```text
pnpm install --frozen-lockfile
pnpm --filter @papyrus-sdk/types build
pnpm --filter @papyrus-sdk/core build
pnpm --filter @papyrus-sdk/engine-native build
pnpm --filter @papyrus-sdk/ui-react-native build
pnpm exec node scripts/verify-mobile-expo-resolution.mjs --skip-generated
cd examples/mobile-expo/android
bash ./gradlew :app:assembleRelease --rerun-tasks -PreactNativeArchitectures=x86_64 -Pexpo.gif.enabled=false -Pexpo.webp.enabled=false
cd ../../..
pnpm exec node scripts/verify-mobile-expo-resolution.mjs
```

The package build step is required because `workspace:*` packages publish
their `dist/` entry points and those generated files are intentionally not
stored in git.

## Evidence

Initial clean build before this PR failed in Metro with:

```text
The required package `expo-asset` cannot be found
```

After the fix, a fresh frozen install recreated the isolated dependency tree,
the package builds generated the local `workspace:*` entry points, Expo
autolinking resolved `expo-asset` through Expo 52, Metro bundled 776 modules,
and the release build completed successfully with 841 Gradle tasks.

APK evidence from this validation:

```text
path: examples/mobile-expo/android/app/build/outputs/apk/release/app-release.apk
sha256: d85d39f7a1745995978bec992b2beba135ea0b28f4ff22353d9f43e601c46371
device: emulator-5554 only
install: Success
package: com.papyrus.sdk.mobileexpo
smoke: application launched and rendered the Papyrus PDF example
```

The focused JavaScript checks passed 10/10, the lifecycle aggregate passed
10/10 with Node's test runner, and the native engine test task completed
successfully. The resolution check passed both before and after generated
autolinking output; the latter confirmed
`import expo.modules.ExpoModulesPackage;`.

Warnings about `NODE_ENV` and deprecations remain upstream/tooling warnings;
they do not fail the release build.

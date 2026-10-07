# Native iOS release gate

Before publishing native package changes, require a successful **Native iOS
compile / Compile and link native iOS SDK** check for the exact release commit.
The workflow installs Pods and compiles/links the React Native example against
workspace sources, including PDFKit, PencilKit, the comic C++ wrapper and all
vendored libarchive reader sources. It runs on native SDK pull requests and main
changes, and can also be dispatched on a release branch.

On a Mac with Node, pnpm, Xcode and CocoaPods installed:

```sh
pnpm install --frozen-lockfile --config.node-linker=hoisted
pnpm --filter @papyrus-sdk/types build
pnpm --filter @papyrus-sdk/core build
pnpm --filter @papyrus-sdk/engine-native build
pnpm --filter @papyrus-sdk/ui-react-native build
bash scripts/ci/compile-ios-native.sh
```

Each invocation uses fresh DerivedData and preserves Pod installation output,
the full compiler log and an xcresult bundle. The build is unsigned and creates
no IPA, npm publication or EAS job. TypeScript/Vitest and npm pack remain useful
checks but are not evidence of native iOS compilation. A successful compile
does not replace device smoke of reading, selection, search, annotations and
PencilKit.

The CI installs JS dependencies with the hoisted layout used by the mobile
consumer. This avoids validating a different pnpm symlink layout in CocoaPods.

The pod version is read from `packages/engine-native/package.json`; C++17 is
explicit in the pod target settings. The renderPage telemetry arguments and
Android destination map are implemented upstream. Consumers of beta.6 should
remove the earlier beta.5 bridge patch instead of porting it.

Publish engine-native first and ui-react-native second only after the compile
gate passes, then verify both exact versions in the registry before updating
the consumer lockfile. Distribution builds must use the same validated SDK
source and compatible native runtime.

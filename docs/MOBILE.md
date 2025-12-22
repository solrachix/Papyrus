# Papyrus Mobile (RN CLI + Expo compatibility)
Read this in: English | [Portuguese (Brazil)](MOBILE.pt-BR.md)

## Goal
Base the SDK on RN CLI with a native engine, while keeping Expo users unblocked via prebuild + config plugin.

## RN CLI foundation
1) Create an app shell (recommended path):
```
npx react-native init PapyrusMobile
```
2) Place the app under `examples/mobile` or point it to the monorepo packages.
3) Link workspace packages (`@papyrus/*`) in your app's `package.json`.

## Engine native
- iOS: PDFKit
- Android: PDFium
- Bridge: native module + view (legacy bridge for now; TurboModule/JSI can be layered later)

Text extraction + search are implemented via the native module and surfaced through `DocumentEngine.searchText` and `SearchService`.

Expected native module name: `PapyrusNativeEngine`
Expected native view name: `PapyrusPageView`

The JS wrapper lives in `packages/engine-native`.

## Example app (RN CLI)
The repo includes an example app at `examples/mobile` that consumes `@papyrus/*`.

From the repo root:
```
cd examples/mobile
npm install
```

New Architecture is enabled by default in the example app (`android/gradle.properties` + `ios/Podfile`).

iOS (macOS only):
```
cd ios
pod install
cd ..
npm run ios
```

Android:
```
npm run android
```

## Expo compatibility (no lock-in)
Use Expo with prebuild and a config plugin:
1) `expo prebuild`
2) `expo run:ios` / `expo run:android`
3) Use a Dev Client

Create `@papyrus/expo-plugin` to inject the native engine into the generated iOS/Android projects.

## Notes
- `DocumentSource` supports `{ uri }`, `{ data }`, `ArrayBuffer`, and `Uint8Array`.
- UI components for RN live in `packages/ui-react-native`.

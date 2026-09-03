# Changelog

## 2026-09-03

### Changed

This release packages the Android reader stabilization cycle from PR20 through
PR29.

- Improved EPUB, TXT, PDF and comic document loading lifecycle handling.
- Stabilized PDF pinch rendering, distant jumps, rotation recovery and large
  document virtualization on Android.
- Added render, scroll, native surface and memory/lifecycle diagnostics that
  remain opt-in.
- Added Android memory/lifecycle stress validation with bounded view and bitmap
  ownership behavior.
- Made the Expo 52 / pnpm isolated Android release build reproducible.
- Preserved the existing public package APIs; this is a patch release.

### Published packages

| Package | Version |
| --- | --- |
| `@papyrus-sdk/core` | `0.2.20` |
| `@papyrus-sdk/engine-cbr` | `0.1.2` |
| `@papyrus-sdk/engine-cbz` | `0.1.2` |
| `@papyrus-sdk/engine-cbz-rust` | `0.1.1` |
| `@papyrus-sdk/engine-native` | `0.2.19` |
| `@papyrus-sdk/engine-pdfjs` | `0.2.11` |
| `@papyrus-sdk/types` | `0.2.14` |
| `@papyrus-sdk/ui-react` | `0.2.30` |
| `@papyrus-sdk/ui-react-native` | `0.2.26` |

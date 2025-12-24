# Mobile

Papyrus mobile uses React Native UI plus a native engine bridge.

## Packages

- `@papyrus-sdk/engine-native` for iOS (PDFKit) and Android (PDFium)
- `@papyrus-sdk/ui-react-native` for the viewer, sheets, and toolbars

## Status

- Text search and selection are handled on the native side.
- UI is built in React Native and mirrors web flows.
- Expo prebuild is supported via `@papyrus-sdk/expo-plugin`.

## Notes

Mobile requires native build steps (Xcode / Android Studio). Examples live in:
- `examples/mobile` (RN CLI)
- `examples/mobile-expo` (Expo + prebuild)

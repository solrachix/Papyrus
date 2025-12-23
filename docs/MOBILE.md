# Mobile

Papyrus mobile uses React Native UI plus a native engine bridge.

## Packages

- `@papyrus/engine-native` for iOS (PDFKit) and Android (PDFium)
- `@papyrus/ui-react-native` for the viewer, sheets, and toolbars

## Status

- Text search and selection are handled on the native side.
- UI is built in React Native and mirrors web flows.
- Expo plugin is planned after the native API stabilizes.

## Notes

Mobile requires native build steps (Xcode / Android Studio). The RN example
is located in `examples/mobile`.

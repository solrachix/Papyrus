# Mobile

Papyrus no mobile usa UI em React Native e engine nativa.

## Pacotes

- `@papyrus-sdk/engine-native` para iOS (PDFKit) e Android (PDFium)
- `@papyrus-sdk/ui-react-native` para viewer, sheets e toolbars

## Status

- Busca e selecao de texto no native.
- UI em RN com fluxo parecido com o web.
- Expo prebuild suportado via `@papyrus-sdk/expo-plugin`.

## Nota

Mobile exige build nativo (Xcode / Android Studio). Exemplos:
- `examples/mobile` (RN CLI)
- `examples/mobile-expo` (Expo + prebuild)

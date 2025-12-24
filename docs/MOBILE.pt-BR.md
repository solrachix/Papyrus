# Papyrus Mobile (RN CLI + compatibilidade com Expo)
Leia em: [English](mobile.md) | Portugues (Brasil)

## Objetivo
Basear o SDK em RN CLI com engine nativa, mantendo usuarios do Expo sem bloqueio via prebuild + config plugin.

## Base RN CLI
1) Crie um app shell (caminho recomendado):
```
npx react-native init PapyrusMobile
```
2) Coloque o app em `examples/mobile` ou aponte para os pacotes do monorepo.
3) Linke os pacotes `@papyrus-sdk/*` no `package.json` do app.

## Engine nativa
- iOS: PDFKit
- Android: PDFium
- Bridge: native module + view (legacy bridge por enquanto; TurboModule/JSI podem ser adicionados depois)

Extracao de texto e busca sao implementadas via modulo nativo e expostas por `DocumentEngine.searchText` e `SearchService`.

Nome esperado do modulo nativo: `PapyrusNativeEngine`
Nome esperado da view nativa: `PapyrusPageView`

O wrapper JS fica em `packages/engine-native`.

## App de exemplo (RN CLI)
O repo inclui um app de exemplo em `examples/mobile` que consome `@papyrus-sdk/*`.

Na raiz do repo:
```
cd examples/mobile
npm install
```

New Architecture esta habilitada por padrao no app de exemplo (`android/gradle.properties` + `ios/Podfile`).

iOS (apenas macOS):
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

## Compatibilidade com Expo (sem lock-in)
Use Expo com prebuild e um config plugin:
1) `expo prebuild`
2) `expo run:ios` / `expo run:android`
3) Use um Dev Client

Plugin: `@papyrus-sdk/expo-plugin`.
Exemplo pronto em `examples/mobile-expo`.

## Notas
- `DocumentSource` suporta `{ uri }`, `{ data }`, `ArrayBuffer` e `Uint8Array`.
- Componentes de UI para RN ficam em `packages/ui-react-native`.

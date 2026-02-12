---
title: "Mobile"
description: "Papyrus no mobile usa UI em React Native e engine nativa."
---
# Mobile

Papyrus no mobile usa UI em React Native e engine nativa.

## Pacotes

- `@papyrus-sdk/engine-native` para iOS (PDFKit) e Android (PDFium)
- `@papyrus-sdk/ui-react-native` para viewer, sheets e toolbars

## Status

- Busca e selecao de texto no native.
- UI em RN com fluxo parecido com o web.
- Expo prebuild suportado via `@papyrus-sdk/expo-plugin`.

## Baseline UX mobile (referencia para Web e RN)

Quando o viewer estiver em tela pequena, manter este padrao:

- Header com acoes principais sempre visiveis.
- Esquerda: botao de menu (thumbnails) + botao de lapis para abrir/fechar toolbar de anotacao.
- Centro: navegacao de pagina centralizada.
- Direita: busca ao lado do botao `...` (overflow).
- Remover marca longa no mobile (ex.: `PapyrusCore`) para priorizar titulo e controles.

Modal de `...` (acoes rapidas):

- Incluir zoom com `-` e `+` e percentual atual.
- Incluir tema da pagina.
- Incluir alternancia de tema da UI com icone.
- Incluir upload com icone.
- Nao duplicar busca dentro do modal quando a busca ja estiver no header.
- Manter o modal aberto apos trocar o tema da pagina/UI.
- Garantir contraste de borda e texto (evitar preto sobre preto).

Comportamento de layout:

- Sidebar de thumbnails e painel de busca devem abrir em overlay, sem empurrar as paginas para o lado.
- Viewer deve suportar pinch-to-zoom (gesto de dois dedos) em telas touch.
- Toolbar de anotacoes deve iniciar fechada e abrir por acao explicita (botao de lapis).
- Se a toolbar fechar, popovers internos (ex.: seletor de cor) tambem devem fechar.
- Bottom sheet/modal deve ficar acima da toolbar (camada/z-index maior).

## Nota

Mobile exige build nativo (Xcode / Android Studio). Exemplos:
- `examples/mobile` (RN CLI)
- `examples/mobile-expo` (Expo + prebuild)

Build dos pacotes antes de rodar os examples:
```bash
pnpm -r --filter "./packages/**" --sort --workspace-concurrency=1 build
```

APK Android (example RN CLI):
```bash
cd examples/mobile/android
./gradlew assembleRelease
```

Instalar no emulador/dispositivo:
```bash
adb install -r app/build/outputs/apk/release/app-release.apk
```

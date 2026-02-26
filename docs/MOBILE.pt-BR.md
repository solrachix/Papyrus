---
title: "Papyrus Mobile (RN CLI + compatibilidade com Expo)"
description: "Leia em: English | Portugues (Brasil)"
canonical: "/pt/mobile"
head:
  - - meta
    - name: robots
      content: "noindex,follow"
---
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

Build dos pacotes (na raiz do repo):
```
pnpm -r --filter "./packages/**" --sort --workspace-concurrency=1 build
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

APK Android (release):
```
cd android
./gradlew assembleRelease
```

Instalar no emulador/dispositivo:
```
adb install -r app/build/outputs/apk/release/app-release.apk
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

## Status

- PDF continua nativo (Android PDFium + iOS PDFKit).
- EPUB/TXT renderizam via WebView (epub.js + DOM), mantendo o mesmo shell de UI.
- Busca e selecao de texto variam por engine.
- Ferramentas visuais de anotacao (marca-texto/sublinhar/ondulado/riscado/tinta) por enquanto so no PDF.

## Baseline UX mobile (referencia para Web e RN)

Para telas pequenas, manter este padrao de interacao:

- Header com acoes principais sempre visiveis.
- Lado esquerdo: botao de menu (thumbnails) + botao de lapis para abrir/fechar toolbar de anotacao.
- Centro: navegacao de pagina centralizada.
- Lado direito: busca ao lado do botao `...` (overflow).
- Ocultar marca longa no mobile (ex.: `PapyrusCore`) para priorizar titulo e controles.

Modal de `...` (acoes rapidas):

- Zoom com `-` e `+` e percentual atual.
- Tema da pagina.
- Alternancia de tema da UI com icone.
- Upload com icone.
- Nao duplicar busca no modal quando a busca ja esta no header.
- Manter o modal aberto apos trocar o tema da pagina/UI.
- Contraste de borda/texto legivel (evitar preto sobre preto).

Comportamento de layout:

- Sidebar de thumbnails e painel de busca em overlay, sem empurrar o render das paginas.
- Header e navegacao inferior podem auto-ocultar ao rolar para baixo e reaparecer ao rolar para cima.
- Viewer deve suportar pinch-to-zoom (gesto de dois dedos) em telas touch.
- Toolbar de anotacoes inicia fechada e abre por acao explicita (botao de lapis).
- Ao fechar toolbar, fechar tambem popovers internos (ex.: seletor de cor).
- Bottom sheet/modal deve ficar acima da toolbar (z-index/camada maior).

## Tipos de documento

`DocumentType` inclui:
`'pdf' | 'epub' | 'text'`

Para forcar o tipo:

```ts
import { MobileDocumentEngine } from '@papyrus-sdk/engine-native';

const engine = new MobileDocumentEngine();
await engine.load({ type: 'epub', source: { uri: 'https://example.com/book.epub' } });
```

Compatibilidade mantida:
`engine.load(source)` continua funcionando e o tipo e inferido por extensao (URI) ou mime (data URI), com fallback para `pdf`.

## WebView

EPUB/TXT exigem `react-native-webview` no app host:

```bash
npm install react-native-webview
```

Para apps RN CLI, garanta que o Metro trate `html` como asset:

```js
// metro.config.js
resolver: {
  assetExts: [...assetExts, 'pdf', 'html'],
},
```

Ao carregar EPUB/TXT, renderize `<Viewer />` antes de aguardar `engine.load(...)` para o runtime WebView inicializar.

## Flags de tuning de performance (UI RN)

`@papyrus-sdk/ui-react-native` expoe props para ajustar documentos grandes:

```tsx
<Viewer
  engine={engine}
  virtualWindowSize={8}
  maxToRenderPerBatch={6}
  removeClippedSubviews
/>

<RightSheet engine={engine} thumbsInitialCount={4} />
```

- `virtualWindowSize` (`Viewer`): tamanho da janela da FlatList.
- `maxToRenderPerBatch` (`Viewer`): itens por lote.
- `removeClippedSubviews` (`Viewer`): remove linhas fora da tela.
- `thumbsInitialCount` (`RightSheet`): quantidade inicial de thumbnails.

## Dicas de performance (mobile)

- Mantenha o `Viewer` montado antes de `engine.load(...)` para EPUB/TXT.
- Prefira fonte por URI para arquivos locais (`{ uri: 'file:///...' }`).
- Em Android intermediario com docs grandes (500+ paginas), comece com janelas menores.

## Troubleshooting de arquivos grandes (EPUB/PDF)

- Evite converter arquivos locais grandes para base64 na bridge RN (alto risco de OOM).
- Use carregamento por URI e deixe o runtime buscar/abrir o EPUB como `ArrayBuffer`.
- Timeouts atuais:
  - resposta `load` da bridge WebView: `180000ms`
  - `epub.open` / `epub.ready` no runtime: `180000ms`
  - `epub.display` no runtime: `30000ms`
- Em aparelhos Android com ~4GB, EPUB grande pode demorar no primeiro open por parse do zip e montagem de spine.

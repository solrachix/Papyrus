# PR 14 — Android pinch zoom

## Escopo

Esta rodada move o preview visual do pinch do caminho JS para `react-native-reanimated`/`SharedValue`. O store, `engine.setZoom` e o render final continuam sendo acionados somente no encerramento do gesto.

## Evidência local

- Suíte: `50` arquivos, `168` testes passando.
- Build do pacote `@papyrus-sdk/ui-react-native`: passou.
- Build nativo debug e release do exemplo: passaram após fixar a versão RN do app.
- Teste de contrato do Viewer: passou.
- Teste da geometria de pinch: passou.
- Lint do Viewer e do teste: passou.
- APK release instalado e aberto no `Pixel7Clean`, Android API 35; o PDF de exemplo renderizou corretamente.

## Resolução do ambiente Android

O monorepo mantém `node-linker=hoisted`, mas o exemplo Expo agora usa resolução isolada em `examples/mobile-expo/.npmrc`:

```ini
node-linker=isolated
```

O exemplo também declara o CLI Expo localmente (`@expo/cli@0.22.28`), evitando que o CLI hoistado selecione o Metro de outro workspace. A investigação mostrou:

- `examples/mobile-expo`, com React Native `0.76.0`, resolve Metro `0.81.5`;
- `examples/mobile`, com React Native `0.81.x`, resolve Metro `0.83.6`.

Antes do isolamento, o bundling falhava no Metro hoistado:

```text
Package subpath './src/DeltaBundler/Serializers/sourceMapString' is not defined by "exports" in metro-cache/package.json
```

Com a resolução isolada, o bundling release e o APK foram gerados com sucesso. O erro anterior do Dev Launcher também permanece corrigido com `reactNativeVersion=0.76.0`.

Ainda não há número novo de performance nem evidência manual de pinch/clipping/foco/pan/chrome nesta rodada; esses testes devem ser executados agora que o APK está reproduzível.

## Mudanças observáveis esperadas

- Atualizações de escala e foco durante `onUpdate` ficam na UI thread.
- Não há escrita no store, `engine.setZoom`, `renderPage` ou `renderTextLayer` por frame.
- O commit final continua único e o preview só é removido quando a página âncora sinaliza `onRenderReady`.
- O callback de render-ready está conectado aos modos single, contínuo e dupla página.

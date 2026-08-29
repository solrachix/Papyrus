# PR 14 — Android pinch zoom

## Escopo

Esta rodada move o preview visual do pinch do caminho JS para `react-native-reanimated`/`SharedValue`. O store, `engine.setZoom` e o render final continuam sendo acionados somente no encerramento do gesto.

## Evidência local

- Suíte: `50` arquivos, `168` testes passando.
- Build do pacote `@papyrus-sdk/ui-react-native`: passou.
- Build nativo debug do exemplo: passou após fixar a versão RN do app.
- Teste de contrato do Viewer: passou.
- Teste da geometria de pinch: passou.
- Lint do Viewer e do teste: passou.
- Emulador iniciado: `Pixel7Clean`, Android API 35.

## Validação Android

O APK debug foi reconstruído, mas o bundle JavaScript do exemplo ainda não pôde ser gerado. O Gradle reconhece e configura o Reanimated; o bundling falha no CLI/Metro hoistado do monorepo:

```text
Package subpath './src/DeltaBundler/Serializers/sourceMapString' is not defined by "exports" in metro-cache/package.json
```

O erro do Dev Launcher foi resolvido com `reactNativeVersion=0.76.0`; a nova falha é de resolução do Metro 0.83.6 hoistado versus Metro 0.81.5 do exemplo. A medição manual before/after e os testes de clipping/foco/pan/chrome continuam pendentes até o bundler ser isolado corretamente. Nenhum número novo de performance é declarado nesta PR.

## Mudanças observáveis esperadas

- Atualizações de escala e foco durante `onUpdate` ficam na UI thread.
- Não há escrita no store, `engine.setZoom`, `renderPage` ou `renderTextLayer` por frame.
- O commit final continua único e o preview só é removido quando a página âncora sinaliza `onRenderReady`.
- O callback de render-ready está conectado aos modos single, contínuo e dupla página.

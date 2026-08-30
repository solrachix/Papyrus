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

Os resultados da medição e da validação visual estão registrados abaixo.

## Medição Android — ADB multitoque

Com o ambiente reproduzível, o mesmo PDF de exemplo foi reiniciado entre cinco
sessões. Cada sessão executou dez ciclos de ampliação/redução com dez posições
intermediárias por gesto. O multitoque foi injetado diretamente no dispositivo
virtual tipo A do emulador, sem scrcpy.

| Sessão | Frames | Janky | Janky % | P90 | P95 | Vsync perdido |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 240 | 135 | 56,25% | 29 ms | 32 ms | 0 |
| 2 | 237 | 159 | 67,09% | 32 ms | 46 ms | 1 |
| 3 | 236 | 134 | 56,78% | 29 ms | 32 ms | 2 |
| 4 | 234 | 132 | 56,41% | 27 ms | 32 ms | 1 |
| 5 | 234 | 129 | 55,13% | 27 ms | 32 ms | 1 |

Resumo: mediana de `236` frames, `56,41%` janky, P90 de sessão `29 ms`,
P95 de sessão `32 ms` e mediana de `1` vsync perdido. A baseline da PR13 foi
`43` frames, `23` janky (`53,49%`), P90 de `85 ms` e `2` vsync perdidos.

O P90 observado caiu de `85 ms` para a faixa de `27–32 ms`, mas a taxa de
jank não melhorou materialmente (`56,41%` na mediana contra `53,49%`). Como a
baseline tem outra quantidade de frames e outro procedimento de captura, esta
é uma evidência direcional, não uma comparação estatística perfeitamente
pareada.

As capturas visuais confirmaram ampliação efetiva, texto nítido, chrome estável,
pan horizontal nos dois extremos e ausência de flash branco observável. Os
focos esquerdo, direito, topo e base foram executados; não foi feita uma
medição geométrica pixel a pixel do focal point.

## Mudanças observáveis esperadas

- Atualizações de escala e foco durante `onUpdate` ficam na UI thread.
- Não há escrita no store, `engine.setZoom`, `renderPage` ou `renderTextLayer` por frame.
- O commit final continua único e o preview só é removido quando a página âncora sinaliza `onRenderReady`.
- O callback de render-ready está conectado aos modos single, contínuo e dupla página.

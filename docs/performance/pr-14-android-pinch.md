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

## Medição Android — ADB multitoque (A/B pareado)

Foi usado o mesmo procedimento no `main` e nesta branch, com APK release, o
mesmo PDF de exemplo, `Pixel7Clean`/Android API 35, cinco sessões, dez ciclos
por sessão e dez posições intermediárias por gesto. O multitoque foi injetado
diretamente pelo ADB no protocolo tipo A do emulador, sem scrcpy.

| Versão | Sessão | Frames | Janky | Janky % | P90 | P95 | Vsync perdido |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| main | 1 | 184 | 99 | 53,80% | 18 ms | 24 ms | 0 |
| main | 2 | 203 | 128 | 63,05% | 17 ms | 24 ms | 0 |
| main | 3 | 204 | 150 | 73,53% | 18 ms | 30 ms | 0 |
| main | 4 | 202 | 145 | 71,78% | 18 ms | 27 ms | 0 |
| main | 5 | 206 | 119 | 57,77% | 17 ms | 20 ms | 0 |
| PR14 | 1 | 130 | 76 | 58,46% | 25 ms | 30 ms | 0 |
| PR14 | 2 | 131 | 67 | 51,15% | 27 ms | 32 ms | 0 |
| PR14 | 3 | 126 | 69 | 54,76% | 19 ms | 27 ms | 0 |
| PR14 | 4 | 125 | 61 | 48,80% | 23 ms | 30 ms | 0 |
| PR14 | 5 | 127 | 71 | 55,91% | 18 ms | 26 ms | 0 |

Medianas: `main` teve `63,05%` janky, P90 de `18 ms`, P95 de `24 ms` e `0`
vsync; PR14 teve `54,76%` janky, P90 de `23 ms`, P95 de `30 ms` e `0` vsync.
Assim, o janky caiu aproximadamente `8,29` pontos percentuais, mas os
percentis de latência pioraram. O resultado apoia um benefício parcial do
Reanimated, não uma melhoria inequívoca em todos os indicadores.

Essa coleta é pareada, mas continua sendo um protocolo sintético de multitoque
no emulador; não representa todos os aparelhos nem substitui a validação
manual de percepção visual.

As capturas visuais confirmaram ampliação efetiva, texto nítido, chrome estável,
pan horizontal nos dois extremos e ausência de flash branco observável. Os
focos esquerdo, direito, topo e base foram executados; não foi feita uma
medição geométrica pixel a pixel do focal point.

O fixture `large-1000` não foi validado nesta rodada.

## Validação da implementação

- Atualizações de escala e foco durante `onUpdate` ficam na UI thread.
- Não há escrita no store, `engine.setZoom`, `renderPage` ou `renderTextLayer` por frame.
- O commit final continua único e o preview só é removido quando a página âncora sinaliza `onRenderReady`.
- O callback de render-ready está conectado aos modos single, contínuo e dupla página.

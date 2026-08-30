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

## Medição Android — ADB multitoque (A/B pareado com duração)

Foi usado o mesmo procedimento no `main` e nesta branch, com APK release, o
mesmo PDF de exemplo, `Pixel7Clean`/Android API 35, cinco sessões, dez ciclos
por sessão e dez posições intermediárias por gesto. O multitoque foi injetado
diretamente pelo ADB no protocolo tipo A do emulador, sem scrcpy.

O procedimento reproduzível está em `scripts/benchmarks/android-pinch-ab.sh`:

```bash
bash scripts/benchmarks/android-pinch-ab.sh
```

A duração inclui o overhead de injeção dos eventos ADB; portanto, o FPS abaixo
é uma taxa do protocolo de diagnóstico, não o FPS perceptual do gesto.

| Versão | Sessão | Duração | Frames | FPS | Janky | Janky % | P90 | P95 | Vsync |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| main | 1 | 100,447 s | 203 | 2,02 | 121 | 59,61% | 17 ms | 20 ms | 0 |
| main | 2 | 98,443 s | 199 | 2,02 | 135 | 67,84% | 17 ms | 22 ms | 0 |
| main | 3 | 95,373 s | 199 | 2,09 | 115 | 57,79% | 17 ms | 23 ms | 0 |
| main | 4 | 98,784 s | 202 | 2,05 | 110 | 54,46% | 17 ms | 19 ms | 0 |
| main | 5 | 99,494 s | 202 | 2,03 | 118 | 58,42% | 17 ms | 18 ms | 0 |
| PR14 | 1 | 98,149 s | 127 | 1,29 | 84 | 66,14% | 23 ms | 30 ms | 0 |
| PR14 | 2 | 98,901 s | 129 | 1,30 | 69 | 53,49% | 23 ms | 27 ms | 0 |
| PR14 | 3 | 100,135 s | 128 | 1,28 | 81 | 63,28% | 26 ms | 32 ms | 0 |
| PR14 | 4 | 100,590 s | 130 | 1,29 | 78 | 60,00% | 20 ms | 23 ms | 0 |
| PR14 | 5 | 96,857 s | 129 | 1,33 | 84 | 65,12% | 23 ms | 29 ms | 0 |

Medianas: `main` teve `98,784 s`, `202` frames, `2,03 FPS`, `58,42%` janky,
P90 de `17 ms`, P95 de `20 ms` e `0` vsync; PR14 teve `98,901 s`, `129` frames,
`1,29 FPS`, `63,28%` janky, P90 de `23 ms`, P95 de `29 ms` e `0` vsync.
Com durações equivalentes, a PR14 produziu aproximadamente `36%` menos frames
e não demonstrou ganho de fluidez neste protocolo.

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

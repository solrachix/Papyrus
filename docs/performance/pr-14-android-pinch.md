# PR 14 — Android pinch benchmark and environment

## Escopo

Esta rodada entrega uma forma reproduzível de medir o pinch Android e corrige o
ambiente Expo/Metro usado na validação. A tentativa de mover o preview para
Reanimated/SharedValue foi medida, não demonstrou ganho e foi revertida; o
Viewer voltou ao caminho incremental com React Native Animated existente em
`main`.

## Evidência local

- Suíte focal de pinch: `24` testes passando (`3` de contrato + `21` de geometria/comportamento).
- Suíte ampla: `169` testes passando e `2` falhando em `examples/web/App.phase1-shell.test.tsx`; as mesmas duas falhas de React duplicado foram reproduzidas em `main`.
- Build do pacote `@papyrus-sdk/ui-react-native`: passou.
- Build release limpo do exemplo: passou após fixar a versão RN do app e a resolução do Metro.
- Teste de contrato do Viewer: passou.
- Teste da geometria de pinch: passou.
- Lint do Viewer e do teste: passou.
- APK release instalado e aberto no `Pixel7Clean`, Android API 35; o PDF de exemplo renderizou corretamente.

## Resolução do ambiente Android

O workspace agora fixa a resolução isolada do pnpm na raiz, onde essa
configuração é efetivamente lida por todos os importers:

```ini
node-linker=isolated
```

O arquivo anterior em `examples/mobile-expo/.npmrc` não isolava uma instalação
iniciada na raiz do workspace e foi removido. O exemplo também declara o CLI
Expo localmente (`@expo/cli@0.22.28`). Como `@expo/metro-config@0.19.12` usa
imports internos do Metro sem declará-los, uma `packageExtension` direcionada
liga esse pacote ao `metro`, `metro-cache` e `metro-transform-worker` `0.81.5`
esperados pelo stack Expo 52/RN 0.76, sem substituir globalmente o Metro usado
pelos outros exemplos. A investigação mostrou:

- `examples/mobile-expo`, com React Native `0.76.0`, resolve Metro `0.81.5`;
- `examples/mobile`, com React Native `0.81.x`, resolve Metro `0.83.6`.

Antes do isolamento, o bundling falhava no Metro hoistado:

```text
Package subpath './src/DeltaBundler/Serializers/sourceMapString' is not defined by "exports" in metro-cache/package.json
```

Com a resolução isolada, o bundling release e o APK foram gerados com sucesso. O erro anterior do Dev Launcher também permanece corrigido com `reactNativeVersion=0.76.0`.

Os resultados da medição e da validação visual estão registrados abaixo.

## Medição Android — baseline ADB corrigida

O procedimento usa APK release, o PDF de exemplo, `Pixel7Clean`/Android API 35,
cinco sessões, dez ciclos por sessão e dez posições intermediárias para abrir e
fechar cada gesto. O multitoque é injetado diretamente pelo ADB no protocolo
tipo A do emulador, sem scrcpy. Antes de medir, o script confirma o processo e
aguarda mais cinco segundos para a primeira superfície.

O procedimento reproduzível está em `scripts/benchmarks/android-pinch-ab.sh`:

```bash
bash scripts/benchmarks/android-pinch-ab.sh
```

A duração inclui o overhead de injeção dos eventos ADB; portanto, o FPS abaixo
é uma taxa do protocolo de diagnóstico, não o FPS perceptual do gesto.

| Versão | Sessão | Duração | Frames | FPS | Janky | Janky % | P90 | P95 | Vsync |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| pós-reversão | 1 | 86,962 s | 184 | 2,12 | 131 | 71,20% | 17 ms | 17 ms | 0 |
| pós-reversão | 2 | 88,815 s | 181 | 2,04 | 120 | 66,30% | 16 ms | 20 ms | 0 |
| pós-reversão | 3 | 87,250 s | 182 | 2,09 | 120 | 65,93% | 17 ms | 18 ms | 0 |
| pós-reversão | 4 | 87,351 s | 187 | 2,14 | 127 | 67,91% | 17 ms | 21 ms | 0 |
| pós-reversão | 5 | 88,003 s | 184 | 2,09 | 114 | 61,96% | 16 ms | 18 ms | 0 |

Medianas da baseline corrigida: `87,351 s`, `184` frames, `2,09 FPS`, `66,30%`
janky, P90 de `16 ms`, P95 de `18 ms` e `0` vsync perdido. O janky percentual
continua variável e não deve ser interpretado isoladamente.

### Correção do protocolo anterior

A revisão final encontrou um erro na trajetória usada nas coletas A/B
anteriores: a abertura afastava os dedos gradualmente, mas o trecho de volta
reduzia a distância em um salto e depois movia ambos na mesma direção. Portanto,
os números antigos de `main`, tentativa Reanimated e primeira pós-reversão não
são um A/B válido de `pinch-in → pinch-out` e não são usados como prova de ganho
ou regressão. O teste `android-pinch-ab.test.mjs` agora protege a simetria da
trajetória e o gate de inicialização.

A tentativa Reanimated foi removida porque não produziu evidência confiável de
benefício que justificasse uma nova dependência obrigatória. Se essa abordagem
for reconsiderada, deverá ser comparada novamente contra esta baseline usando o
protocolo corrigido.

Esta coleta continua sendo sintética e inclui overhead de ADB; não representa
todos os aparelhos nem substitui validação manual de percepção visual.

As capturas visuais confirmaram ampliação efetiva, texto nítido, chrome estável,
pan horizontal nos dois extremos e ausência de flash branco observável. Os
focos esquerdo, direito, topo e base foram executados; não foi feita uma
medição geométrica pixel a pixel do focal point.

O fixture `large-1000` não foi validado nesta rodada.

Backlog da próxima investigação: montar o `Viewer` com engine/store falsos e
Promise de render controlada para validar em runtime os updates, o commit único
e o handshake. O teste de 50 updates desta PR cobre o controller comportamental;
o teste do `Viewer` continua sendo um guardrail estático.

## Resultado da investigação

- Reanimated, SharedValue, `useAnimatedStyle`, o helper `runOnJS` do Reanimated e o plugin Babel foram removidos desta PR; `.runOnJS(true)` do Gesture Handler permanece no caminho incremental.
- O SDK e o exemplo Expo não declaram `react-native-reanimated` como dependência.
- O bundle release não contém módulo, plugin, inicializador de worklet ou native module do Reanimated.
- O Viewer voltou ao React Native Animated presente em `main`.
- Não há escrita no store, `engine.setZoom`, `renderPage` ou `renderTextLayer` por frame.
- O commit final continua único e o preview só é removido quando a página âncora sinaliza `onRenderReady`.
- O benchmark ADB, a medição de duração/FPS, o isolamento pnpm/Metro, o CLI Expo local,
  `reactNativeVersion=0.76.0` e a correção `documentType={activeType}` foram preservados.

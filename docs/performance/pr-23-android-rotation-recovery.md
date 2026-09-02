# PR23 — Android PDF rotation recovery

## Escopo

Validação do caminho Android `viewerMode=compat` com `FlatList`, usando apenas o
`emulator-5554`. O viewer nativo, iOS, web, EPUB/TXT/CBR, pinch e distant jump
ficam fora desta rodada.

## Evidência reproduzida

Ambiente:

- dispositivo: Android Emulator `Pixel_7_API_35`, serial `emulator-5554`;
- exemplo: `examples/mobile-expo`, React Native 0.76;
- build: debug local da branch `codex/pr23-android-rotation-recovery`;
- fixture: PDF sintético `large-1000`, `viewerMode=compat`;
- transição: portrait → landscape, com orientação controlada por ADB.

Antes da correção, a superfície existente era legível em portrait (`996×1294`).
Após a rotação, o `PageRenderer` solicitava bitmaps de `2180×2822`; o
`PapyrusPageView` instalava esses bitmaps sem erro, mas a superfície ficava
branca. A instrumentação temporária confirmou pixels `ffffffff` no bitmap novo.
Em uma execução anterior, a mesma transição também produziu
`Canvas: trying to use a recycled bitmap`, causado pela remoção do bitmap do
cache enquanto uma `PapyrusPageView` ainda o referenciava.

A investigação mostrou que o blank de landscape não era um bitmap vazio: a
renderização produzia pixels não brancos, mas a `FlatList` preservava o offset
vertical calculado para a geometria de portrait. Depois da mudança de largura,
a página corrente permanecia fora da viewport, criando um espaço branco visível.

## Correção

- a configuração do example deixou de bloquear a atividade em portrait;
- o limite de rasterização Android foi reduzido para `2048` px por aresta,
  mantendo a proporção e o limite de pixels existente;
- bitmaps compartilhados pelo `LruCache` agora só são reciclados quando não há
  referências ativas em páginas montadas;
- `onDropViewInstance()` chama `dispose()` para liberar a referência da página
  e invalidar renders assíncronos que ainda estejam em voo;
- o teste unitário cobre o ownership do bitmap e o tamanho seguro da transição
  `2180×2822 → 1582×2048`, além do descarte da `PapyrusPageView`.

## Validação pós-correção

Com o limite `2048`, a mesma transição foi repetida no emulator-5554. O
bitmap passou a ser instalado em `1582×2048`, com conteúdo não branco, e a
página permaneceu visível em landscape. A correção adicional restaura o offset
da página lógica corrente usando as métricas da nova orientação, depois do
layout da `FlatList`.

O APK final da branch também foi instalado no `emulator-5554` e passou por um
smoke portrait → landscape → portrait. As duas capturas mostraram a página
legível; o logcat não registrou `Canvas: trying to use a recycled bitmap` nem
falha fatal do `PapyrusPageView`. O smoke final usou a tela sintética de uma
página porque o harness Metro foi reiniciado durante a reconstrução do APK;
ele não substitui a matriz completa com `large-1000`.

Uma matriz de 20 alternâncias portrait/landscape foi executada no
`emulator-5554` com `large-1000`, após reinstalação do APK com bundle JS
regenerado. A captura final permaneceu legível na página 4, sem
`Canvas: trying to use a recycled bitmap`, exceção fatal ou ANR no logcat.
Também foram feitas transições rápidas e o smoke portrait → landscape →
portrait. A captura pós-correção está em `/tmp/pr23-matrix-final.png`.

O restore final usa somente as fronteiras de mudança de largura e de layout da
`FlatList`; não há timer arbitrário entre a nova geometria e o
`scrollToOffset`.

O PSS do processo foi `131883 KB` no início e `146901 KB` ao final da matriz;
o native heap foi `64340 KB` e `63572 KB`, respectivamente. Essa leitura é um
smoke de memória, não uma prova de ausência de crescimento em uma sessão longa.

O auto-carregamento do fixture e os logs de investigação foram usados apenas
para a validação local e foram removidos da árvore de trabalho.

## Comandos de verificação

```text
adb -s emulator-5554 shell settings put system accelerometer_rotation 0
adb -s emulator-5554 shell settings put system user_rotation 0
adb -s emulator-5554 shell settings put system user_rotation 1
```

Testes locais executados:

```text
pnpm exec vitest run packages/ui-react-native
cd examples/mobile-expo/android
bash ./gradlew :papyrus-sdk_engine-native:test :app:assembleDebug \
  -x app:generateAutolinkingPackageList
```

Resultado: `viewerPerformance.test.ts` 6/6 aprovado; o pacote
`@papyrus-sdk/ui-react-native` foi compilado; e `app:assembleRelease` foi
aprovado no harness Android. A matriz foi executada exclusivamente no
`emulator-5554`.

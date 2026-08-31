# Papyrus PR15 — Android pinch profiling

## Escopo

Esta rodada mede o caminho `Viewer`/`PageRenderer` no modo `compat`. O preview
continua usando a implementação existente; a PR adiciona fixtures offline,
IDs causais, fronteira real de `surface-ready`, injector multipointer e
agregação reproduzível. O experimento Reanimated da PR14 não é base desta
branch.

## Reprodução

```bash
pnpm fixtures:mobile:check
rtk bash examples/mobile-expo/android/gradlew \
  -p examples/mobile-expo/android \
  -PreactNativeArchitectures=x86_64 \
  -Pexpo.gif.enabled=false \
  -Pexpo.webp.enabled=false \
  :app:assembleRelease
node scripts/benchmarks/android-apk-fixtures-check.mjs \
  --apk examples/mobile-expo/android/app/build/outputs/apk/release/app-release.apk \
  --manifest examples/mobile-expo/assets/fixtures/fixture-manifest.json \
  --commit "$(git rev-parse HEAD)"
bash scripts/benchmarks/android-pinch-profile.sh \
  --fixture all --runs 5 --package com.papyrus.sdk.mobileexpo \
  --device emulator-5554 --output-dir /tmp/papyrus-pr15-android
node scripts/benchmarks/android-pinch-aggregate.mjs /tmp/papyrus-pr15-android \
  > /tmp/papyrus-pr15-android/report.json
```

O runner também valida automaticamente o contrato causal e exige pelo menos
`runs - 1` amostras válidas por fixture/direção quando `runs > 1`. Depois de
`sample.end`, ele captura o `gfxinfo` e encerra a janela de FPS; somente então
drena por 10 segundos para capturar terminais tardios. Assim, o drain não
contamina a duração usada no FPS. Um render que excede 5 segundos de
telemetria é explicitamente marcado como `render.abandoned` por timeout.

Cada amostra tem um único gesto multipointer, um `sampleId`, um `gestureId`,
um `documentLoadId` e uma janela `gfxinfo` própria. O agregador exige que cada
`render.request` correlacionado tenha exatamente um terminal (`ready`, `stale`,
`abandoned`, `error` ou `cancelled`). Amostras sem `preview.cleared`, com IDs
divergentes, sem janela de `gfxinfo` ou com request sem terminal são
incompletas e não entram nos percentis.

## Fixtures versionadas

| Fixture | Páginas | Tamanho |
| --- | ---: | ---: |
| `small` | 1 | 1.032 bytes |
| `large-100` | 100 | 54.241 bytes |
| `large-1000` | 1.000 | 522.086 bytes |
| `varied-sizes` | 4 | 2.918 bytes |

Total: 580.277 bytes. Os hashes oficiais estão em
`examples/mobile-expo/assets/fixtures/fixture-manifest.json`.

## Evidência obtida

Execução real em `emulator-5554` (`Pixel_7_API_35`, API 35), com APK release
`x86_64`, deep link offline e 5 gestos multiponto por direção. O stream causal
foi validado com `touches=2`; 40/40 amostras foram completas e todos os oito
grupos fecharam em 5/5. O FPS usa exclusivamente a janela `gfxinfo` entre o
reset e o dump imediatamente após o gesto; o drain de 10 segundos ocorre
depois e serve apenas para observar terminais tardios.

| Fixture | Direção | Válidas | FPS P50 | FPS P90 | Jank P50 | Commit → ready P50/P90 |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `small` | in | 5/5 | 8,87 | 11,89 | 56,67% | 29,3 / 34,7 ms |
| `small` | out | 5/5 | 9,13 | 9,18 | 70,97% | 53,5 / 60,0 ms |
| `large-100` | in | 5/5 | 9,82 | 10,09 | 58,82% | 71,5 / 90,3 ms |
| `large-100` | out | 5/5 | 10,29 | 10,64 | 62,86% | 117,4 / 125,1 ms |
| `large-1000` | in | 5/5 | 10,15 | 10,26 | 57,14% | 74,2 / 89,7 ms |
| `large-1000` | out | 5/5 | 10,16 | 10,35 | 60,00% | 103,2 / 138,7 ms |
| `varied-sizes` | in | 5/5 | 9,61 | 10,24 | 60,61% | 58,3 / 64,8 ms |
| `varied-sizes` | out | 5/5 | 10,11 | 10,27 | 54,29% | 109,0 / 112,5 ms |

FPS usa a duração observada entre reset e dump do `gfxinfo`, antes do drain; a
duração do gesto é reportada separadamente. Os percentis acima são agregados
das 40 amostras completas. O documento de 1.000 páginas não apresentou crash/OOM nessa rodada; a
janela continuou limitada (39 views anexadas no dump final).

O APK universal inicial tinha 85.590.373 bytes. Depois de ligar o filtro de
ABI ao `build.gradle` e gerar o artefato de benchmark com `x86_64` e codecs
opcionais desativados, o APK ficou em 31.086.109 bytes e passou o limite de
30 MiB do inspector. O artefato universal continua fora desse limite e não é
usado para esta validação do emulador.

## Limitações conhecidas

- O intervalo de frames é `dumpsys gfxinfo reset → dump`; os marcadores Papyrus
  delimitam eventos causais, mas não recortam matematicamente os frames.
- O probe tenta eventos do console do Emulator, depois Protocol B e por fim o
  helper opcional `PAPYRUS_MULTITOUCH_HELPER`; dois swipes independentes nunca
  são usados como substituto.
- O modo nativo dedicado com `ScaleGestureDetector` fica fora desta PR.

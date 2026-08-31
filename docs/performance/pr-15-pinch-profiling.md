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

Cada amostra tem um único gesto multipointer, um `sampleId`, um `gestureId`,
um `documentLoadId` e uma janela `gfxinfo` própria. Amostras sem
`preview.cleared` ou com IDs divergentes são incompletas e não entram nos
percentis.

## Fixtures versionadas

| Fixture | Páginas | Tamanho |
| --- | ---: | ---: |
| `small` | 1 | 1.032 bytes |
| `large-100` | 100 | 54.241 bytes |
| `large-1000` | 1.000 | 522.086 bytes |
| `varied-sizes` | 4 | 2.917 bytes |

Total: 580.276 bytes. Os hashes oficiais estão em
`examples/mobile-expo/assets/fixtures/fixture-manifest.json`.

## Evidência obtida

Execução real em `emulator-5554` (`Pixel_7_API_35`, API 35), com APK release
`x86_64`, deep link offline e um gesto multiponto por direção. O stream causal
foi validado com `touches=2`; cada amostra abaixo terminou em
`pinch.preview.cleared` e `sample.end=complete`.

| Fixture | Direção | Frames | Jank | FPS | Commit → ready |
| --- | --- | ---: | ---: | ---: | ---: |
| `small` | in | 20 | 45,0% | 22,64 | 27,1 ms |
| `small` | out | 20 | 55,0% | 22,15 | 33,7 ms |
| `large-100` | in | 24 | 50,0% | 26,68 | 78,6 ms |
| `large-100` | out | 23 | 43,5% | 26,13 | 67,7 ms |
| `large-1000` | in | 23 | 65,2% | 25,63 | 64,8 ms |
| `large-1000` | out | 24 | 62,5% | 26,77 | 74,1 ms |

Essas são amostras únicas por fixture/direção, não uma distribuição P50/P90/P95
de repetição. O documento de 1.000 páginas não apresentou crash/OOM nessa
rodada; a janela continuou limitada (39 views anexadas no dump final).

O APK universal inicial tinha 85.590.373 bytes. Depois de ligar o filtro de
ABI ao `build.gradle` e gerar o artefato de benchmark com `x86_64` e codecs
opcionais desativados, o APK ficou em 31.086.065 bytes e passou o limite de
30 MiB do inspector. O artefato universal continua fora desse limite e não é
usado para esta validação do emulador.

## Limitações conhecidas

- O intervalo de frames é `dumpsys gfxinfo reset → dump`; os marcadores Papyrus
  delimitam eventos causais, mas não recortam matematicamente os frames.
- O probe tenta eventos do console do Emulator, depois Protocol B e por fim o
  helper opcional `PAPYRUS_MULTITOUCH_HELPER`; dois swipes independentes nunca
  são usados como substituto.
- O modo nativo dedicado com `ScaleGestureDetector` fica fora desta PR.

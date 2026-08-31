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
rtk bash examples/mobile-expo/android/gradlew -p examples/mobile-expo/android :app:assembleRelease
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

## Estado da evidência

O harness e os testes determinísticos foram implementados. A matriz Android
real ainda não foi executada neste ambiente: não há emulador ativo e o daemon
ADB não conseguiu abrir a porta local (`Operation not permitted`). Portanto os
campos de FPS, jank, P90/P95, missed vsync e latências reais permanecem
pendentes de execução em `Pixel7Clean`/API 35; nenhum número sintético é
apresentado como medição.

## Limitações conhecidas

- O intervalo de frames é `dumpsys gfxinfo reset → dump`; os marcadores Papyrus
  delimitam eventos causais, mas não recortam matematicamente os frames.
- O probe tenta eventos do console do Emulator, depois Protocol B e por fim o
  helper opcional `PAPYRUS_MULTITOUCH_HELPER`; dois swipes independentes nunca
  são usados como substituto.
- O modo nativo dedicado com `ScaleGestureDetector` fica fora desta PR.

# Papyrus PR 15 Pinch Profiling Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir um harness Android reproduzível que seleciona fixtures offline por deep link e mede causalmente gesto, commit, surface-ready e remoção do preview no Viewer compat.

**Architecture:** A PR nasce de `main` e mantém a instrumentação opt-in. O exemplo Expo resolve fixtures por um parser puro e registry estático; o pacote RN emite NDJSON correlacionado; o adapter Android só conclui `renderPage()` após promover o bitmap; scripts testáveis orquestram multitouch, `gfxinfo` e agregação por fixture/direção.

**Tech Stack:** TypeScript, React Native/Expo, Vitest, Node test runner, Bash/ADB, Java/Android, Pdfium, pnpm.

---

## Estrutura de arquivos

### Criar

- `scripts/benchmarks/android-multitouch-probe.sh` — discovery dinâmico e prova multipointer.
- `scripts/benchmarks/android-multitouch-probe.test.mjs` — contrato do injector real.
- `scripts/benchmarks/pdfFixtureGenerator.mjs` — geração/verificação determinística.
- `scripts/benchmarks/pdfFixtureGenerator.test.mjs` — contratos dos PDFs, manifesto e registry.
- `scripts/benchmarks/generate-mobile-pdf-fixtures.mjs` — CLI de geração/check.
- `examples/mobile-expo/assets/fixtures/{small,large-100,large-1000,varied-sizes}.pdf` — fixtures offline.
- `examples/mobile-expo/assets/fixtures/fixture-manifest.json` — hashes/metadados.
- `examples/mobile-expo/fixtureRegistry.generated.ts` — quatro `require()` literais.
- `examples/mobile-expo/perf/fixtureSelection.ts` e `.test.ts` — parser/resolvedor puro.
- `examples/mobile-expo/perf/fixtureStartup.ts` e `.test.ts` — cold start e URL warm ignorada.
- `packages/ui-react-native/perf/perfSession.ts` e `.test.ts` — contexto/IDs/NDJSON opt-in.
- `packages/ui-react-native/perf/MobilePerfContext.tsx` e `.test.tsx` — propagação App→Viewer→PageRenderer.
- `packages/ui-react-native/perf/pinchPerfSession.ts` e `.test.ts` — máquina causal da amostra.
- `packages/ui-react-native/perf/renderLifecycle.ts` e `.test.ts` — terminal único de render.
- `packages/engine-native/android/src/test/java/com/papyrus/engine/PapyrusPageRenderCompletionTest.java` — surface-ready real.
- `scripts/benchmarks/android-pinch-aggregate.mjs` e `.test.mjs` — correlação/agregação.
- `scripts/benchmarks/android-pinch-profile.sh` e `.test.mjs` — orquestração do benchmark.
- `scripts/benchmarks/android-apk-fixtures-check.mjs` e `.test.mjs` — inspeção do APK/commit/assets.
- `docs/performance/pr-15-pinch-profiling.md` — evidência final reproduzível.

### Modificar

- `scripts/benchmarks/generate-large-pdf.mjs` — extrair primitiva compartilhada, sem duplicar gerador.
- `examples/mobile-expo/App.tsx`, `app.json` e `package.json` — bootstrap e scripts.
- `packages/ui-react-native/perf/mobilePerf.ts` — sink NDJSON compatível com contexto.
- `packages/ui-react-native/components/Viewer.tsx` — eventos de pinch/commit/sample.
- `packages/ui-react-native/components/PageRenderer.tsx` — lifecycle de render.
- `packages/engine-native/index.ts` — aguardar Promise nativa real.
- `packages/types/index.ts` — resultado opcional tipado de renderPage.
- `packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusNativeEngineModule.java` — Promise por request.
- `packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusPageView.java` — terminal após promoção do bitmap.
- `vitest.config.ts`, `package.json`, `pnpm-lock.yaml` — testes e comandos.
- `scripts/benchmarks/README.md` — protocolo e limitações.

## Chunk 1: Gate multipointer e fixtures reproduzíveis

### Task 0: Verificar o ambiente Android independente da PR 14

**Files:**
- Modify: `.npmrc`
- Modify: `examples/mobile-expo/android/gradle.properties`

- [ ] **Step 1: Registrar o RED ambiental atual**

```bash
pnpm install --frozen-lockfile
rtk bash examples/mobile-expo/android/gradlew -p examples/mobile-expo/android projects --console=plain
```

Expected no checkout atual: falha de metadata Kotlin causada por resolução hoisted incompatível.

- [ ] **Step 2: Aplicar os ajustes somente se o RED for reproduzido**

Se o RED for reproduzido, alterar `.npmrc` de `node-linker=hoisted` para
`node-linker=isolated` e adicionar `reactNativeVersion=0.76.0` em
`examples/mobile-expo/android/gradle.properties`. Se o gate já estiver verde,
não criar uma mudança ambiental sem necessidade. Em ambos os casos, não portar
Reanimated, Babel plugin ou código do Viewer.

- [ ] **Step 3: Reinstalar e verificar Gradle GREEN**

```bash
pnpm install --frozen-lockfile
rtk bash examples/mobile-expo/android/gradlew -p examples/mobile-expo/android projects --console=plain
```

- [ ] **Step 4: Commit**

```bash
git add .npmrc examples/mobile-expo/android/gradle.properties
git commit -m "fix(example): isolate reproducible Expo dependencies"
```

### Task 1: Provar o injector multipointer no Pixel7Clean

**Files:**
- Create: `scripts/benchmarks/android-multitouch-probe.sh`
- Modify: `scripts/benchmarks/README.md`

- [ ] **Step 1: Registrar o estado do AVD sem hard-code no script**

Run:

```bash
PAPYRUS_TEST_DEVICE=emulator-5554
adb devices
adb -s "$PAPYRUS_TEST_DEVICE" shell getprop ro.boot.qemu.avd_name
adb -s "$PAPYRUS_TEST_DEVICE" shell getprop ro.build.version.sdk
adb -s "$PAPYRUS_TEST_DEVICE" shell getevent -lp
adb -s "$PAPYRUS_TEST_DEVICE" shell id
adb -s "$PAPYRUS_TEST_DEVICE" shell ls -l /dev/input
```

Expected: `Pixel7Clean`, API 35, touchscreen Protocol B com `ABS_MT_SLOT`, `ABS_MT_TRACKING_ID`, posição X/Y e permissão de escrita para `shell`.

- [ ] **Step 2: Detectar mecanismos na ordem definida pela spec**

Primeiro consultar o injector multipointer próprio do Android Emulator e
registrar suporte/ausência. Se indisponível, tentar Protocol B com discovery
dinâmico. Se o AVD não permitir escrita, usar helper Android de instrumentation.

- [ ] **Step 3: Escrever o probe do mecanismo selecionado**

O script deve localizar o touchscreen por nome/capabilities, converter coordenadas da viewport para os ranges do device, usar slots 0 e 1 no mesmo `SYN_REPORT`, e sempre liberar os dois tracking IDs em trap de cleanup.

- [ ] **Step 4: Executar contra o app com perf legado habilitado**

Run:

```bash
PAPYRUS_TEST_DEVICE=emulator-5554
bash scripts/benchmarks/android-multitouch-probe.sh --device "$PAPYRUS_TEST_DEVICE" --package com.papyrus.sdk.mobileexpo
adb -s "$PAPYRUS_TEST_DEVICE" logcat -d -v brief > /tmp/papyrus-multitouch-probe.log
test "$(rg -c 'Papyrus Perf.*pinch.start' /tmp/papyrus-multitouch-probe.log)" -eq 1
test "$(rg -c 'Papyrus Perf.*pinch.end' /tmp/papyrus-multitouch-probe.log)" -eq 1
```

Expected: um pinch real reconhecido. Este é o gate pré-instrumentação; a cadeia
completa até `preview.cleared` será exigida no runner final, quando esse evento
existir. Dois swipes independentes são proibidos.

- [ ] **Step 5: Documentar mecanismo, device descoberto e fallback**

- [ ] **Step 6: Commit**

```bash
git add scripts/benchmarks/android-multitouch-probe.sh scripts/benchmarks/README.md
git commit -m "test(android): prove reproducible multipointer injection"
```

### Task 2: Gerar fixtures e registry estático

**Files:**
- Create: `scripts/benchmarks/pdfFixtureGenerator.test.mjs`
- Create: `scripts/benchmarks/pdfFixtureGenerator.mjs`
- Create: `scripts/benchmarks/generate-mobile-pdf-fixtures.mjs`
- Create: `examples/mobile-expo/assets/fixtures/*`
- Create: `examples/mobile-expo/fixtureRegistry.generated.ts`
- Modify: `scripts/benchmarks/generate-large-pdf.mjs`
- Modify: `package.json`
- Modify: `examples/mobile-expo/package.json`

- [ ] **Step 1: Escrever o teste RED de determinismo**

O teste gera duas árvores temporárias e exige bytes/hashes idênticos, page counts `1/100/1000/4`, MediaBoxes variadas, quatro `require("./assets/fixtures/<name>.pdf")` literais, total ≤20 MiB e manifesto coerente.

- [ ] **Step 2: Rodar e confirmar falha pela ausência do gerador**

```bash
node --test scripts/benchmarks/pdfFixtureGenerator.test.mjs
```

Expected: FAIL por módulo/função ausente.

- [ ] **Step 3: Extrair a primitiva do gerador existente**

`scripts/benchmarks/generate-large-pdf.mjs` deve exportar a criação
determinística usada tanto pelo CLI legado quanto por `pdfFixtureGenerator.mjs`;
não criar uma segunda implementação do formato PDF.

- [ ] **Step 4: Implementar manifesto/registry sem timestamps aleatórios**

API planejada:

```js
export async function generateMobileFixtures(outputDir) {}
export async function verifyMobileFixtures(outputDir) {}
```

- [ ] **Step 5: Adicionar scripts e gerar assets versionados**

Adicionar `fixtures:mobile` e `fixtures:mobile:check` no `package.json` raiz e
no exemplo Expo.

```bash
node scripts/benchmarks/generate-mobile-pdf-fixtures.mjs --write
node scripts/benchmarks/generate-mobile-pdf-fixtures.mjs --check
```

- [ ] **Step 6: Rodar teste GREEN**

```bash
node --test scripts/benchmarks/pdfFixtureGenerator.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/benchmarks/generate-large-pdf.mjs scripts/benchmarks/pdfFixtureGenerator.mjs scripts/benchmarks/pdfFixtureGenerator.test.mjs scripts/benchmarks/generate-mobile-pdf-fixtures.mjs examples/mobile-expo/assets/fixtures examples/mobile-expo/fixtureRegistry.generated.ts package.json examples/mobile-expo/package.json
git commit -m "test(expo): add deterministic mobile PDF fixtures"
```

### Task 3: Resolver deep link e bootstrap do exemplo

**Files:**
- Create: `examples/mobile-expo/perf/fixtureSelection.ts`
- Create: `examples/mobile-expo/perf/fixtureSelection.test.ts`
- Create: `examples/mobile-expo/perf/fixtureStartup.ts`
- Create: `examples/mobile-expo/perf/fixtureStartup.test.ts`
- Modify: `examples/mobile-expo/App.tsx`
- Modify: `examples/mobile-expo/app.json`
- Modify: `vitest.config.ts`

- [ ] **Step 1: Escrever testes RED do parser**

Cobrir URL nula, `exp+papyrus-sdk://reader`, parâmetros completos, fixture inválida com fallback explícito, scheme/host/path inválidos e `viewerMode != compat`.

- [ ] **Step 2: Rodar RED**

```bash
pnpm exec vitest run examples/mobile-expo/perf/fixtureSelection.test.ts
```

- [ ] **Step 3: Implementar funções puras**

```ts
parsePapyrusReaderUrl(url: string | null): ParsedReaderLaunch
resolveFixtureLaunch(parsed: ParsedReaderLaunch): ResolvedFixtureLaunch
```

- [ ] **Step 4: Escrever teste RED do cold start e URL warm**

Provar uma carga no cold start, `fixture.invalid` quando aplicável,
`fixture.requested` antes de `engine.load`, `fixture.loaded` depois do page count
com `resolvedFixture`, `sha256`, `byteLength` e `pageCount`, e zero reloads no
evento warm, que gera `fixture.url_ignored`.

- [ ] **Step 5: Rodar o RED do bootstrap antes de implementar**

```bash
pnpm exec vitest run examples/mobile-expo/perf/fixtureStartup.test.ts
```

- [ ] **Step 6: Implementar bootstrap com engine/emitter injetados**

- [ ] **Step 7: Integrar em App.tsx e configurar scheme**

Remover fallback HTTP; corrigir `docType` para `activeType`; configurar `viewerMode: "compat"`; passar `<Viewer viewerMode="compat">`; manter cleanup da assinatura e do engine.
Em `app.json`, definir explicitamente `"scheme": "exp+papyrus-sdk"`; manter o
host `reader` no intent filter Android existente.

- [ ] **Step 8: Rodar GREEN e typecheck**

```bash
pnpm exec vitest run examples/mobile-expo/perf/fixtureSelection.test.ts examples/mobile-expo/perf/fixtureStartup.test.ts
pnpm --filter papyrus-mobile-expo exec tsc --noEmit
```

- [ ] **Step 9: Provar o deep link no Android real**

```bash
PAPYRUS_TEST_DEVICE=emulator-5554
rtk bash examples/mobile-expo/android/gradlew -p examples/mobile-expo/android :app:assembleDebug
adb -s "$PAPYRUS_TEST_DEVICE" install -r examples/mobile-expo/android/app/build/outputs/apk/debug/app-debug.apk
adb -s "$PAPYRUS_TEST_DEVICE" shell am force-stop com.papyrus.sdk.mobileexpo
adb -s "$PAPYRUS_TEST_DEVICE" logcat -c
adb -s "$PAPYRUS_TEST_DEVICE" shell am start -W -a android.intent.action.VIEW -d 'exp+papyrus-sdk://reader?fixture=large-100&runId=probe&sampleId=probe-1&perf=1&viewerMode=compat' com.papyrus.sdk.mobileexpo
adb -s "$PAPYRUS_TEST_DEVICE" logcat -d -v brief > /tmp/papyrus-fixture-deeplink.log
rg 'fixture.loaded' /tmp/papyrus-fixture-deeplink.log
```

Expected: `fixture.loaded` contém `large-100`, hash/tamanho iguais ao manifesto
e `pageCount=100`. O teste automatizado do bootstrap fará a comparação exata.

- [ ] **Step 10: Commit**

```bash
git add examples/mobile-expo/App.tsx examples/mobile-expo/app.json examples/mobile-expo/perf vitest.config.ts
git commit -m "feat(expo): select benchmark fixtures by deep link"
```

## Chunk 2: Telemetria causal e surface-ready real

### Task 4: Implementar schema opt-in, IDs e NDJSON

**Files:**
- Create: `packages/ui-react-native/perf/perfSession.ts`
- Create: `packages/ui-react-native/perf/perfSession.test.ts`
- Create: `packages/ui-react-native/perf/MobilePerfContext.tsx`
- Create: `packages/ui-react-native/perf/MobilePerfContext.test.tsx`
- Modify: `packages/ui-react-native/perf/mobilePerf.ts`
- Modify: `packages/ui-react-native/index.ts`
- Modify: `examples/mobile-expo/App.tsx`

- [ ] **Step 1: Escrever testes RED**

Provar: disabled não chama sink/clock/timer; IDs únicos; timestamp monotônico; campos comuns imutáveis; uma linha JSON por evento.

- [ ] **Step 2: Rodar RED**

```bash
pnpm exec vitest run packages/ui-react-native/perf/perfSession.test.ts
```

- [ ] **Step 3: Escrever RED da propagação do contexto**

Provar que `MobilePerfProvider` entrega o mesmo `runId`, `sampleId`,
`documentLoadId` e `fixture` a consumidores aninhados e que disabled usa um
recorder no-op estável.

- [ ] **Step 4: Rodar RED do contexto**

```bash
pnpm exec vitest run packages/ui-react-native/perf/MobilePerfContext.test.tsx
```

- [ ] **Step 5: Implementar recorder e provider mínimos**

```ts
createPerfSession({ enabled, context, now, sink })
session.createId(kind)
session.emit(name, payload)
```

- [ ] **Step 6: Integrar App→Viewer→PageRenderer**

O App cria `documentLoadId`, instancia a sessão a partir do deep link e envolve
o reader em `MobilePerfProvider`. Exportar provider/hook em
`packages/ui-react-native/index.ts`. Viewer e PageRenderer leem o mesmo objeto;
nenhum deles recria IDs de execução ou documento.

- [ ] **Step 7: Rodar GREEN e testes legados de perf**

- [ ] **Step 8: Commit**

```bash
git add packages/ui-react-native/perf/mobilePerf.ts packages/ui-react-native/perf/perfSession.ts packages/ui-react-native/perf/perfSession.test.ts packages/ui-react-native/perf/MobilePerfContext.tsx packages/ui-react-native/perf/MobilePerfContext.test.tsx packages/ui-react-native/index.ts examples/mobile-expo/App.tsx
git commit -m "feat(perf): add correlated mobile event sessions"
```

### Task 5: Instrumentar lifecycle do pinch compat

**Files:**
- Create: `packages/ui-react-native/perf/pinchPerfSession.ts`
- Create: `packages/ui-react-native/perf/pinchPerfSession.test.ts`
- Modify: `packages/ui-react-native/components/Viewer.tsx`
- Modify: `packages/ui-react-native/gesture/pinchZoom.test.mjs`

- [ ] **Step 1: Escrever RED para uma amostra completa**

Esperar: `sample.start → pinch.start → pinch.end → commit.start → commit.end → preview.cleared → sample.end complete`, um commit.

- [ ] **Step 2: Escrever RED para orphan/cancel/no-op**

No-op (`delta < 0.001`) emite `pinch.cancelled reason=no-op` e `sample.end incomplete`, sem commit. `onFinalize` após `onEnd` não duplica terminal.

- [ ] **Step 3: Rodar RED**

```bash
pnpm exec vitest run packages/ui-react-native/perf/pinchPerfSession.test.ts
node --test packages/ui-react-native/gesture/pinchZoom.test.mjs
```

- [ ] **Step 4: Implementar máquina pura e o trecho pré-render no Viewer**

Criar `gestureId` em `beginViewerPinch`, manter o mesmo ID nos updates
amostrados e envolver store/engine commit. A máquina pura expõe
`completeAfterRenderReady(...)`; a integração real de `handlePinchRenderReady`
fica na Task 7, depois do handshake Android e dos callbacks de todos os ramos.

- [ ] **Step 5: Emitir e validar `viewer.mode=compat`**

- [ ] **Step 6: Rodar GREEN**

- [ ] **Step 7: Commit**

```bash
git add packages/ui-react-native/perf/pinchPerfSession.ts packages/ui-react-native/perf/pinchPerfSession.test.ts packages/ui-react-native/components/Viewer.tsx packages/ui-react-native/gesture/pinchZoom.test.mjs
git commit -m "feat(perf): correlate compat pinch lifecycle"
```

### Task 6: Fazer renderPage aguardar surface-ready Android

**Files:**
- Modify: `packages/types/index.ts`
- Modify: `packages/engine-native/index.ts`
- Modify: `packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusNativeEngineModule.java`
- Modify: `packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusPageView.java`
- Create: `packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusRenderCompletion.java`
- Create: `packages/engine-native/android/src/test/java/com/papyrus/engine/PapyrusPageRenderCompletionTest.java`

- [ ] **Step 1: Escrever RED do contrato TypeScript e do coordenador Java puro**

Definir resultado opcional `RenderPageResult` com status `ready|stale|cancelled`;
adapters legados podem continuar retornando `void`. O coordenador Java puro
garante terminal único: cache/bitmap promovido conclui ready, token obsoleto
conclui stale e cancelamento confirmado conclui cancelled. Erro rejeita com
código `papyrus_render_error`; cleanup/unmount continua sendo classificado como
abandoned pelo lifecycle JS, não pelo bridge.

- [ ] **Step 2: Rodar RED**

```bash
rtk bash examples/mobile-expo/android/gradlew -p examples/mobile-expo/android :papyrus-sdk_engine-native:testDebugUnitTest --tests com.papyrus.engine.PapyrusPageRenderCompletionTest --console=plain
```

- [ ] **Step 3: Implementar completion por request**

Adicionar `Promise` ao método nativo, passar o coordenador para
`PapyrusPageView.render(...)` e completar exatamente uma vez após instalar
cache/bitmap na UI thread. O bridge resolve `{status, requestId}` para
ready/stale/cancelled e rejeita somente erro real. O caminho JS deve
`await native.renderPage(...)` e retornar o resultado tipado.

- [ ] **Step 4: Rodar GREEN e build do engine**

```bash
rtk bash examples/mobile-expo/android/gradlew -p examples/mobile-expo/android :papyrus-sdk_engine-native:testDebugUnitTest --tests com.papyrus.engine.PapyrusPageRenderCompletionTest --console=plain
pnpm --filter @papyrus-sdk/engine-native build
```

- [ ] **Step 5: Commit**

```bash
git add packages/types/index.ts packages/engine-native/index.ts packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusNativeEngineModule.java packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusPageView.java packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusRenderCompletion.java packages/engine-native/android/src/test/java/com/papyrus/engine/PapyrusPageRenderCompletionTest.java
git commit -m "fix(android): resolve render after surface promotion"
```

### Task 7: Instrumentar terminal único no PageRenderer

**Files:**
- Create: `packages/ui-react-native/perf/renderLifecycle.ts`
- Create: `packages/ui-react-native/perf/renderLifecycle.test.ts`
- Modify: `packages/ui-react-native/components/PageRenderer.tsx`
- Modify: `packages/ui-react-native/components/Viewer.tsx`

- [ ] **Step 1: Escrever RED de terminal único**

Cobrir `RenderPageResult.ready/stale/cancelled`, rejeição
`papyrus_render_error`, abandoned por cleanup JS e terminal único. Cleanup nunca
vira cancelled; resolução tardia após cleanup não altera o terminal.

- [ ] **Step 2: Escrever RED para todos os ramos Viewer**

Single, continuous e double devem fornecer `surfaceId` estável e `onRenderReady`; o anchor render deve carregar o `gestureId` pendente.

- [ ] **Step 3: Rodar RED**

```bash
pnpm exec vitest run packages/ui-react-native/perf/renderLifecycle.test.ts
```

- [ ] **Step 4: Integrar lifecycle preservando render generation atual**

Mapear o resultado tipado do adapter para ready/stale/cancelled; mapear rejeição
para error e cleanup local para abandoned. Passar `surfaceId`, `gestureId` e
`onRenderReady` nos ramos single, continuous e double.

- [ ] **Step 5: Finalizar a integração da máquina de pinch**

Ligar o ready da página âncora a `completeAfterRenderReady`, emitir
`pinch.preview.cleared` e `sample.end complete` somente após o terminal ready
correspondente. Executar o teste de integração que antes era apenas simulado na
Task 5.

- [ ] **Step 6: Rodar GREEN e build RN**

```bash
pnpm exec vitest run packages/ui-react-native/perf/renderLifecycle.test.ts packages/core/renderGeneration.test.ts
pnpm --filter @papyrus-sdk/ui-react-native build
```

- [ ] **Step 7: Commit**

```bash
git add packages/ui-react-native/perf/renderLifecycle.ts packages/ui-react-native/perf/renderLifecycle.test.ts packages/ui-react-native/components/PageRenderer.tsx packages/ui-react-native/components/Viewer.tsx
git commit -m "feat(perf): track render requests to surface ready"
```

## Chunk 3: Runner, agregação e prova real

### Task 8: Implementar agregador de amostras

**Files:**
- Create: `scripts/benchmarks/android-pinch-aggregate.mjs`
- Create: `scripts/benchmarks/android-pinch-aggregate.test.mjs`

- [ ] **Step 1: Escrever fixtures RED de NDJSON/gfxinfo**

Cobrir amostra completa, commit duplicado, terminal ausente, IDs divergentes,
fixture/hash divergente, native mode, no-op, direção sem quatro válidas,
`gfxinfo` com jank/vsync e agrupamento estrito por fixture+direção.

- [ ] **Step 2: Rodar RED**

```bash
node --test scripts/benchmarks/android-pinch-aggregate.test.mjs
```

- [ ] **Step 3: Implementar parser/correlação/agregação**

Produzir `schemaVersion: 1` com `environment`, `rawEvents`, `samples` e
`aggregates`. Cada amostra guarda metadados, duração/FPS, frames, janky count e
percentual, frame P50/P90/P95/max, missed vsync, renders
active/ready/stale/abandoned/error/cancelled e os intervalos gesture, commit,
commit→request, request→ready e ready→preview-cleared. Agregados registram
`validN/totalN` por fixture+direção e usam nearest-rank:
`sorted[clamp(ceil(p * n) - 1)]`. Preservar `gfxinfo` separado do intervalo
Papyrus e nunca converter ausência em zero.

- [ ] **Step 4: Rodar GREEN**

- [ ] **Step 5: Commit**

```bash
git add scripts/benchmarks/android-pinch-aggregate.mjs scripts/benchmarks/android-pinch-aggregate.test.mjs
git commit -m "test(perf): aggregate correlated Android pinch samples"
```

### Task 9: Implementar runner multi-fixture

**Files:**
- Create: `scripts/benchmarks/android-pinch-profile.sh`
- Create: `scripts/benchmarks/android-pinch-profile.test.mjs`
- Modify: `package.json`
- Modify: `scripts/benchmarks/README.md`

- [ ] **Step 1: Escrever RED do contrato CLI**

Cobrir fixture única/lista/all, `--device` validando só o serial, ausência de
`--device` exigindo um device, cinco amostras por direção, cold start por
amostra e falha sem eventos causais completos. Exigir deep link com `runId`,
`sampleId`, `perf=1`, `viewerMode=compat`; pinch central, 1200 ms e raio 120 dp;
warm-up após `fixture.loaded` e antes do reset de `gfxinfo`.

- [ ] **Step 2: Rodar RED**

```bash
node --test scripts/benchmarks/android-pinch-profile.test.mjs
```

- [ ] **Step 3: Implementar shell fino sobre probe e agregador**

Guardar por amostra: deep link, logcat NDJSON, dump `gfxinfo`, status e
metadados do build/device. O shell deve esperar `fixture.loaded`, executar um
pinch warm-up descartado, resetar `gfxinfo`, injetar exatamente um pinch no
centro com o mecanismo aprovado e coletar após `sample.end`. Validar a cadeia
completa `sample.start → pinch.start → pinch.end → commit → render.ready →
preview.cleared → sample.end`.

- [ ] **Step 4: Rodar GREEN**

- [ ] **Step 5: Commit**

```bash
git add scripts/benchmarks/android-pinch-profile.sh scripts/benchmarks/android-pinch-profile.test.mjs scripts/benchmarks/README.md package.json
git commit -m "test(android): add multi-fixture pinch profiler"
```

### Task 10: Validar APK e executar matriz real

**Files:**
- Create: `scripts/benchmarks/android-apk-fixtures-check.mjs`
- Create: `scripts/benchmarks/android-apk-fixtures-check.test.mjs`
- Create: `docs/performance/pr-15-pinch-profiling.md`

- [ ] **Step 1: Escrever RED do inspector de APK**

Com runner de processos injetado, testar: APK >30 MiB; fixture ausente; hash
divergente; manifesto/registry ausente do bundle; fallback HTTP encontrado;
worktree suja; e caso válido que retorna APK SHA-256, manifest SHA-256 e commit.

- [ ] **Step 2: Rodar RED e implementar o inspector**

```bash
node --test scripts/benchmarks/android-apk-fixtures-check.test.mjs
```

O inspector extrai o APK em diretório temporário, calcula hash de todos os
arquivos e exige correspondência dos quatro SHA-256 do manifesto; inspeciona o
bundle por manifesto/registry e proíbe o fallback remoto conhecido. Ele exige
worktree limpa antes do build e registra `HEAD`, hash do manifesto e hash do APK.

- [ ] **Step 3: Rodar GREEN do inspector**

```bash
node --test scripts/benchmarks/android-apk-fixtures-check.test.mjs
```

- [ ] **Step 4: Rodar checks focados**

```bash
node --test scripts/benchmarks/pdfFixtureGenerator.test.mjs scripts/benchmarks/android-pinch-profile.test.mjs scripts/benchmarks/android-pinch-aggregate.test.mjs scripts/benchmarks/android-apk-fixtures-check.test.mjs
pnpm exec vitest run examples/mobile-expo/perf packages/ui-react-native/perf
node --test packages/ui-react-native/gesture/pinchZoom.test.mjs
```

- [ ] **Step 5: Rodar gates gerais**

```bash
pnpm test:phase1
pnpm lint:phase1
pnpm build
git diff --check
```

- [ ] **Step 6: Gerar APK release a partir de worktree limpa**

```bash
test -z "$(git status --porcelain)"
PAPYRUS_BUILD_COMMIT="$(git rev-parse HEAD)"
rtk bash examples/mobile-expo/android/gradlew -p examples/mobile-expo/android :app:assembleRelease
node scripts/benchmarks/android-apk-fixtures-check.mjs \
  --apk examples/mobile-expo/android/app/build/outputs/apk/release/app-release.apk \
  --manifest examples/mobile-expo/assets/fixtures/fixture-manifest.json \
  --commit "$PAPYRUS_BUILD_COMMIT"
```

- [ ] **Step 7: Instalar e executar a matriz**

```bash
PAPYRUS_TEST_DEVICE=emulator-5554
adb -s "$PAPYRUS_TEST_DEVICE" install -r examples/mobile-expo/android/app/build/outputs/apk/release/app-release.apk
bash scripts/benchmarks/android-pinch-profile.sh \
  --fixture all \
  --runs 5 \
  --package com.papyrus.sdk.mobileexpo \
  --device "$PAPYRUS_TEST_DEVICE"
```

Expected: ≥4 amostras válidas por fixture e direção; relatório `schemaVersion=1`
com `validN/totalN`, raw events e samples; nenhuma amostra incompleta nos
percentis; quatro assets presentes por hash; APK ≤30 MiB; relatório distingue
gesture, commit, commit→request, request→ready, ready→preview-cleared, FPS, jank,
frame percentis, missed vsync e terminais de render.

- [ ] **Step 8: Registrar ambiente, resultados e limitações**

- [ ] **Step 9: Commit**

```bash
git add scripts/benchmarks/android-apk-fixtures-check.mjs scripts/benchmarks/android-apk-fixtures-check.test.mjs docs/performance/pr-15-pinch-profiling.md
git commit -m "docs(perf): record Android pinch profiling evidence"
```

- [ ] **Step 10: Revisar diff contra main e abrir PR**

```bash
git diff --check
git diff --stat origin/main...HEAD
git log --oneline origin/main..HEAD
```

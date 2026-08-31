# Papyrus PR15 Instrumentation Hardening Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar a instrumentação Android da PR15 causal, matematicamente consistente e reproduzível sem alterar o algoritmo do pinch.

**Architecture:** IDs de gesto serão metadata capturada no momento de um render já disparado, sem participar das dependências que iniciam render. A máquina de sessão será a única responsável por fechar uma amostra após o handshake de surface-ready. O runner validará o contrato completo antes de aceitar uma amostra.

**Tech Stack:** TypeScript/React Native, Vitest, Node test runner, Bash/ADB, Gradle e fixtures PDF determinísticas.

---

### Task 1: Causalidade e caminho desativado

**Files:**
- Modify: `packages/ui-react-native/components/PageRenderer.tsx`
- Modify: `packages/ui-react-native/components/Viewer.tsx`
- Test: `packages/ui-react-native/perf/pinchPerfSession.test.ts`
- Test: `packages/ui-react-native/perf/renderLifecycle.test.ts`

- [ ] Escrever testes que provem que `completeAfterRenderReady` fecha a sessão e que metadata incidental não dispara render.
- [ ] Remover `gestureId` das dependências de render e capturar o ID comprometido via ref.
- [ ] Encaminhar o fechamento do Viewer para a máquina causal.
- [ ] Garantir que `perf=off` não emita nem crie trabalho de telemetria adicional.

### Task 2: Harness e métricas

**Files:**
- Modify: `scripts/benchmarks/android-pinch-aggregate.mjs`
- Modify: `scripts/benchmarks/android-pinch-profile.sh`
- Modify: `scripts/benchmarks/android-multitouch-probe.sh`
- Test: `scripts/benchmarks/android-pinch-aggregate.test.mjs`
- Test: `scripts/benchmarks/android-pinch-profile.test.mjs`

- [ ] Escrever casos para `sampleDuration`/`gfxWindowDuration`, contrato inválido e conversão dp.
- [ ] Corrigir FPS para usar a janela do sample/gfx, não a duração do gesto.
- [ ] Fazer o runner validar fixture, modo, IDs, terminais e quantidade mínima de amostras válidas.
- [ ] Converter raio de dp para px usando a densidade do dispositivo.

### Task 3: Fixtures e contexto causal

**Files:**
- Modify: `scripts/benchmarks/pdfFixtureGenerator.mjs`
- Modify: `scripts/benchmarks/pdfFixtureGenerator.test.mjs`
- Modify: `examples/mobile-expo/perf/fixtureStartup.ts`
- Modify: `examples/mobile-expo/App.tsx`
- Test: `examples/mobile-expo/perf/fixtureStartup.test.ts`

- [ ] Atualizar `varied-sizes` para 612x792, 792x612, 360x540 e 1000x500.
- [ ] Criar o contexto de run/document antes do load e usar o mesmo recorder nos eventos da fixture.
- [ ] Regenerar manifesto, registry e PDFs.

### Task 4: Validação e publicação

**Files:**
- Modify: `docs/performance/pr-15-pinch-profiling.md`
- Modify: `scripts/benchmarks/README.md`

- [ ] Rodar testes direcionados, build release e inspeção do APK.
- [ ] Executar o comando de aceite com as quatro fixtures e registrar limites honestos.
- [ ] Atualizar a PR, criar commit e publicar o head.

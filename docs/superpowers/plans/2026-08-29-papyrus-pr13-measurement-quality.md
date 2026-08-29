# Papyrus PR13 Measurement Quality Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar a medição da PR 13 reproduzível e semanticamente correta, isolando frames por cenário, distinguindo render abandonado de cancelamento confirmado, agregando repetições e versionando a evidência Android.

**Architecture:** O Viewer abre e encerra sessões de amostragem somente nos limites do pinch. O collector publica a amostra da sessão como evento de telemetria. O relatório transforma todas as amostras de zoom/jump em estatísticas de distribuição. O relatório Android registra evidências observadas sem alterar o comportamento do reader.

**Tech Stack:** TypeScript, React, Vitest, PDF.js/Papyrus web telemetry, Node benchmark scripts, Android adb/scrcpy evidence.

---

## 1. Testes primeiro

- [x] Adicionar testes para reset/resultado de uma sessão de frame sampling nomeada.
- [x] Adicionar testes para agregação de todas as medições de zoom e jump, com mediana/P90/P95/máximo.
- [x] Adicionar teste garantindo que a memória seja reportada como valor no snapshot, não como `peakMemoryBytes`.
- [ ] Adicionar teste para o evento de render abandonado no cleanup do `PageRenderer`.
- [x] Rodar os testes direcionados e confirmar falhas antes da implementação.

## 2. Implementação

- [x] Remover o sampling global iniciado no mount do Viewer.
- [x] Iniciar/parar a sessão `pinch` nos limites do gesto e incluir a amostra final na telemetria.
- [x] Renomear o evento emitido no unmount antes da conclusão para `render.abandoned`.
- [x] Atualizar o protocolo web para agregar repetições e renomear o campo de memória para `heapAtSnapshotBytes`.
- [x] Atualizar testes e documentação do protocolo.

## 3. Evidência e baseline

- [x] Versionar `docs/performance/pr-13-real-world-validation.md` com dispositivo, API, commit, fixtures, comandos, métricas e bugs observados.
- [x] Executar o teste `examples/web/App.phase1-shell.test.tsx` na `main` limpa e registrar o resultado comparativo.
- [x] Atualizar o README de benchmarks para apontar para o relatório versionado.

## 4. Verificação e publicação

- [x] Rodar testes direcionados, suíte relevante, lint/build disponíveis e revisar o diff.
- [x] Confirmar que não há alterações fora do escopo.
- [ ] Commitar e fazer push na branch da PR 13.
- [ ] Verificar o estado remoto da PR e reportar o novo head.

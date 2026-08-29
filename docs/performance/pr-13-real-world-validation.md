# Papyrus — PR 13: validação real de performance

## Escopo

Esta rodada valida o comportamento observável do reader em Web e Android. Ela é diagnóstica: os bugs encontrados abaixo ficam registrados para as próximas PRs e não são corrigidos nesta PR.

- PR: [#13](https://github.com/solrachix/Papyrus/pull/13)
- Commit validado: `bdf05f249da8e481449fa51c3a7b2ce9c52a1c47`
- Runtime Android: emulador `Pixel7Clean`, `emulator-5554`, Android 15 / API 35
- Fixtures: `small-20`, `medium-200`, `large-1000`, `image-heavy`, `varied-sizes`, `text-heavy`
- Fonte das fixtures: `scripts/benchmarks/perf-fixtures.mjs`

## Protocolo executado

Web: abrir cada fixture, executar zoom `1 → 5 → 1` em ciclos repetidos, scroll rápido, jump distante, rotação quando disponível e coletar wrappers, canvases, PageRenderers, eventos e medidas.

Android: instalar o APK do exemplo Expo no AVD, abrir PDF pequeno e PDF sintético de 1000 páginas, fazer scroll e jump, executar pinch real pelo scrcpy, girar para landscape, abrir EPUB/TEXT e coletar `dumpsys gfxinfo`/`dumpsys meminfo`.

Comandos principais usados:

```text
node scripts/benchmarks/perf-fixtures.mjs --output /tmp/papyrus-pr13-android-fixtures
adb -s emulator-5554 shell dumpsys gfxinfo com.papyrus.example
adb -s emulator-5554 shell dumpsys meminfo com.papyrus.example
scrcpy -s emulator-5554 --no-audio --window-title Papyrus-Emulator --stay-awake
```

## Resultados Android observados

| Cenário | Evidência |
| --- | --- |
| PDF pequeno + scroll | 701 frames, 11 janky (1,57%), P90 17 ms, 0 vsync lost |
| PDF de 1000 páginas + scroll | 550 frames, 188 janky (34,18%), 80 vsync lost; PSS após o cenário ~333.495 KB |
| Pinch real | 43 frames, 23 janky (53,49%), P90 85 ms, 2 vsync lost |
| Virtualização no PDF de 1000 páginas | conteúdo avançou até as páginas 24–26 após 20 swipes; não foram montadas 1000 páginas simultaneamente |

O pinch real também mostrou clipping horizontal após o zoom. O jump distante terminou com páginas brancas. A rotação para landscape ficou em loading e EPUB/TEXT permaneceram no spinner apesar do WebView reportar carregamento.

Capturas locais usadas durante a validação: `/tmp/papyrus-android-real-pinch-final.png`, `/tmp/papyrus-android-large-1000.png`, `/tmp/papyrus-android-large-after-scroll.png`, `/tmp/papyrus-android-page-jump-10-final.png` e `/tmp/papyrus-android-after-rotation.png`.

## Verificação do module graph React/Zustand

Após remover os diretórios `node_modules` gerados somente da worktree da PR e executar uma instalação limpa com lockfile congelado, o teste direcionado passou:

```text
pnpm exec vitest run examples/web/App.phase1-shell.test.tsx
```

- PR 13 / head atual: 2 testes passaram.
- `main` / `715eeba`: 2 testes passaram.

As falhas anteriores eram efeito de estado residual da instalação da worktree. O bisect sem reinstalação por commit foi inconclusivo e não deve ser usado como evidência de regressão.

## Limitações

- As fixtures são determinísticas e sintéticas; não representam a distribuição de PDFs reais.
- As métricas Android são de um AVD Pixel 7 API 35, não de aparelhos físicos.
- Os resultados Android acima são evidência de diagnóstico, não metas de produto.
- A atualização do protocolo separa sessões de frame por cenário, diferencia render abandonado de cancelamento real, agrega percentis das repetições e chama a memória de `heapAtSnapshotBytes`, pois uma leitura única não é pico de memória.
- Suíte final na instalação limpa: 52 arquivos, 175 testes aprovados e 2 ignorados.

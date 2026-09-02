# Plan: Papyrus PR25 — large PDF scroll/jank no Android

**Goal:** medir o scroll do PDF grande no Android compat e implementar uma
melhoria somente quando o baseline identificar uma causa dominante.

**Architecture:** reutilizar `MobilePerf`, o monitor de scroll do `Viewer`, os
eventos de lifecycle do `PageRenderer`, `dumpsys gfxinfo` e PSS; manter o
viewer nativo e os demais formatos fora do escopo.

## Steps

1. **Confirmar base e ambiente** — verify `origin/main`, branch/worktree,
   fixture registry, APK path e exclusivamente `emulator-5554`.
2. **Mapear e instrumentar a sessão** — add only opt-in counters/metadata for
   scroll duration, direction, frames, render requests/terminals, mounted
   views/window and memory; add focused tests first.
3. **Run current baseline** — build/install the main-like APK and execute the
   reproducible short, medium, large-1000 and varied-sizes scroll protocols;
   save raw evidence and `docs/performance/pr-25-large-pdf-scroll-baseline.md`.
4. **Classify one cause** — compare render amplification, stale work, layout,
   windowing, bitmap allocation and frame/PSS data; stop without a code fix if
   no relevant regression is reproducible.
5. **Implement the smallest evidence-backed fix** — add the corresponding unit
   or runtime contract test before changing production behavior.
6. **Run paired A/B** — same device, fixture, APK type and gesture protocol;
   report median/P90/P95, ranges, render counts, attached views and memory.
7. **Regression validation** — focused tests, package build, release APK,
   large-1000/varied-sizes smoke, distant-jump/rotation/pinch checks and
   `git diff --check`.
8. **Finalize** — update the final report, remove temporary diagnostics,
   commit scoped files, push the branch and open the PR; do not merge it.

## Risks and mitigations

- Host ADB commands can contaminate frame windows: reset gfxinfo immediately
  before the gesture and dump at its end, using the same script for A/B.
- JS event sampling is not a native frame truth: label it as auxiliary and
  prefer `gfxinfo`/Perfetto for frame timing.
- Existing render terminal events include normal unmounts: classify
  `abandoned` separately from confirmed engine cancellation.
- Synthetic page dimensions can hide layout costs: include `varied-sizes` and
  report it separately from uniform fixtures.

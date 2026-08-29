# Papyrus PR14 Android Pinch Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir o pinch-to-zoom Android/RN para manter escala relativa, focal point, viewport/pan e chrome estáveis, reduzindo jank sem rasterização durante `onUpdate`.

**Architecture:** Preservar a surface renderizada e aplicar apenas uma transformação visual relativa na document surface durante o gesto. O zoom global, `engine.setZoom`, ajuste de scroll e render final acontecem uma vez no fim; a surface nova substitui a antiga somente quando estiver pronta. Reanimated não entra sem evidência de que o caminho atual não atende ao contrato.

**Tech Stack:** React Native, React Native Gesture Handler/Animated, TypeScript, Vitest, Expo Android, ADB/scrcpy e telemetria da PR 13.

---

## 1. Diagnóstico

- [ ] Inspecionar `Viewer`, `PageRenderer`, helpers de viewport e telemetria RN na `main`.
- [ ] Mapear start/update/end, valores Animated, store, engine, render, scroll e chrome.
- [ ] Registrar causas confirmadas ou não reproduzidas para escala, clipping, focal e jank.

## 2. Testes primeiro

- [ ] Adicionar testes red para zero side effects durante updates.
- [ ] Adicionar testes red para um commit no end, escala relativa e clamp.
- [ ] Adicionar testes red para focal point, sessão órfã, chrome isolado e promoção da surface.
- [ ] Executar os testes direcionados e confirmar as falhas corretas.

## 3. Implementação mínima

- [ ] Corrigir o modelo de preview para `pendingZoom / committedZoom` sem acumulação.
- [ ] Corrigir anchor/scroll com bounds reais do conteúdo.
- [ ] Garantir que somente a document surface receba transform e que o chrome fique fora dela.
- [ ] Preservar commit único, latest-wins e surface retention existentes.
- [ ] Manter Animated atual; avaliar Reanimated somente se a medição comprovar necessidade.

## 4. Verificação Android

- [ ] Rodar suíte, lint, build e testes RN focados.
- [ ] Reproduzir no AVD o baseline e repetir 20 ciclos, focal points e pan em 5x.
- [ ] Medir frames, jank, P90/P95, commits e surface pronta após a alteração.
- [ ] Capturar screenshots/UI dump e registrar limitações.

## 5. Publicação

- [ ] Atualizar relatório da PR 14 com causa raiz e before/after real.
- [ ] Commitar, abrir PR 14 contra `main` e entregar o link/head.

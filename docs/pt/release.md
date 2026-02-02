---
title: "Release / Publicacao"
description: "Como versionar, buildar e publicar pacotes no npm."
---
# Release / Publicacao

Este repo publica pacotes no npm (escopo `@papyrus-sdk/*`).

## 1) Bump de versoes

Use o script para atualizar a versao de todos os pacotes em `packages/*`:

```bash
pnpm bump:packages minor
```

Bumps validos: `patch`, `minor`, `major`.

## 2) Build dos pacotes

Build **somente dos pacotes** (pula exemplos) para evitar problemas do Vite/esbuild:

```bash
pnpm -r --filter ./packages/** build
```

Se quiser buildar tudo:

```bash
pnpm -r --workspace-concurrency=1 build
```

Observacao: `examples/web` pode falhar no Windows com `Error: spawn EPERM` (esbuild). Se acontecer, fique no build apenas dos pacotes.

## 3) Commit das mudancas

O publish exige working tree limpo, a menos que use `--no-git-checks`.

```bash
git add .
git commit -m "release: bump packages to vX.Y.Z"
```

## 4) Publicar no npm

```bash
pnpm -r --filter ./packages/** publish --access public
```

Se for publicar com working tree sujo:

```bash
pnpm -r --filter ./packages/** publish --access public --no-git-checks
```

## Publicar somente pacotes alterados

Detecta mudancas desde `origin/main` (ou `BASE_REF`) e publica apenas esses pacotes.

```bash
pnpm publish:changed
```

Build apenas:

```bash
pnpm build:changed
```

Trocar o base ref:

```bash
BASE_REF=main pnpm publish:changed
```

### Tags

Para usar tag:

```bash
pnpm -r --filter ./packages/** publish --access public --tag next
```

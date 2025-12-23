---
layout: home
title: Papyrus
titleTemplate: false
hero:
  name: Papyrus
  text: Modular PDF SDK
  tagline: Build reader, search, and annotation UX with a clean core and swappable engines.
  actions:
    - theme: brand
      text: Quickstart
      link: /quickstart
    - theme: alt
      text: Architecture
      link: /architecture
features:
  - title: Engine agnostic
    details: Swap PDF.js on web and PDFKit or PDFium on mobile without changing UI logic.
  - title: Event driven core
    details: useViewerStore and papyrusEvents unify state, actions, and lifecycle hooks.
  - title: UI ready
    details: React and React Native UI layers ship with search, outlines, and themes.
  - title: Configurable
    details: PapyrusConfig covers initial page, zoom, theme, accent, and annotations.
---

## What is inside

- `@papyrus/types`: contracts for engines, annotations, and events.
- `@papyrus/core`: Zustand store plus papyrusEvents for UI and app logic.
- `@papyrus/engine-pdfjs`: web adapter built on PDF.js.
- `@papyrus/ui-react`: web UI components (Topbar, Sidebar, Viewer).
- `@papyrus/engine-native`: native engine bridge for iOS and Android.
- `@papyrus/ui-react-native`: mobile UI components and sheets.

## Why Papyrus

Papyrus is for product teams that need a PDF experience closer to Figma or Notion:
search, selection, highlights, and custom UI on top of a stable engine layer.

## Next steps

- Start here: [Quickstart](/quickstart)
- Understand the layers: [Architecture](/architecture)
- Configure themes and behavior: [Configuration](/configuration)
- Mobile status: [Mobile](/mobile)

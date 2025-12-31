---
layout: home
title: Papyrus
titleTemplate: false
description: Open source PDF, EPUB, and TXT SDK for web and mobile document readers.
hero:
  name: Papyrus
  text: Open source PDF/EPUB/TXT SDK
  tagline: Build document readers with search, annotations, and theming for web and mobile (React + React Native).
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
  - title: PDF, EPUB, TXT
    details: Same UI shell across formats, with EPUB/TXT running in a WebView on mobile.
  - title: Event driven core
    details: useViewerStore and papyrusEvents unify state, actions, and lifecycle hooks.
  - title: UI ready
    details: React and React Native UI layers ship with search, outlines, and themes.
  - title: Configurable
    details: PapyrusConfig covers initial page, zoom, theme, accent, and annotations.
---

## What is inside

- `@papyrus-sdk/types`: contracts for engines, annotations, and events.
- `@papyrus-sdk/core`: Zustand store plus papyrusEvents for UI and app logic.
- `@papyrus-sdk/engine-pdfjs`: web adapter built on PDF.js.
- `@papyrus-sdk/ui-react`: web UI components (Topbar, Sidebar, Viewer).
- `@papyrus-sdk/engine-native`: native engine bridge for iOS and Android.
- `@papyrus-sdk/ui-react-native`: mobile UI components and sheets.

## Why Papyrus

Papyrus is an open source PDF, EPUB, and TXT SDK for product teams that need a document experience closer to Figma or Notion:
search, selection, highlights, and custom UI on top of a stable engine layer.

## Quick snippet

Install and render a PDF viewer with the SDK:

```bash
pnpm add @papyrus-sdk/core @papyrus-sdk/ui-react @papyrus-sdk/engine-pdfjs
```

```tsx
import React, { useEffect, useState } from 'react';
import { PDFJSEngine } from '@papyrus-sdk/engine-pdfjs';
import { useViewerStore } from '@papyrus-sdk/core';
import { Viewer } from '@papyrus-sdk/ui-react';

export const App = () => {
  const [engine] = useState(() => new PDFJSEngine());
  const { initializeStore } = useViewerStore();

  useEffect(() => {
    initializeStore({ initialUITheme: 'dark' });
    engine.load('/sample.pdf');
    return () => engine.destroy();
  }, [engine, initializeStore]);

  return <Viewer engine={engine} />;
};
```

## Use cases

- Reading and annotating product specs, research, and design docs.
- Knowledge bases with full-text search across PDF, EPUB, and TXT.
- Legal and compliance review with highlights and notes.
- Education and e-learning with reliable page and outline navigation.
- Publishing workflows that need a branded, embeddable reader.

## FAQ

<details>
<summary>Is Papyrus an open source PDF/EPUB/TXT SDK?</summary>
<p>Yes. Papyrus is an open source SDK that provides a unified UI layer and multiple engines for PDF, EPUB, and TXT.</p>
</details>

<details>
<summary>Can I swap the PDF engine?</summary>
<p>Yes. The architecture is engine-agnostic so you can swap PDF.js, PDFium, or native engines without changing UI logic.</p>
</details>

<details>
<summary>Does it work with React and React Native?</summary>
<p>Yes. Papyrus ships UI layers for React on web and React Native on mobile.</p>
</details>

<details>
<summary>Does it support annotations and search?</summary>
<p>Yes. The core includes events, annotation state, and search hooks for building reader workflows.</p>
</details>

## Built for teams shipping reader UX

Papyrus focuses on real-world document UX: selection, highlights, search, and annotations,
while keeping the engine details behind a consistent API. If you need an open source PDF SDK
for a web or mobile app, this is the core building block.

## Next steps

- Start here: [Quickstart](/quickstart)
- Understand the layers: [Architecture](/architecture)
- Configure themes and behavior: [Configuration](/configuration)
- Papyrus FAQ: [FAQ](/faq)
- Open Source PDF SDK: [Open Source PDF SDK](/open-source-pdf-sdk)
- Open Source EPUB SDK: [Open Source EPUB SDK](/open-source-epub-sdk)
- Papyrus vs PDFTron: [Papyrus vs PDFTron](/papyrus-pdftron-alternative)
- Best Free PDF SDK 2026: [Best Free PDF SDK 2026](/best-free-pdf-sdk-2026)
- Mobile status: [Mobile](/mobile)

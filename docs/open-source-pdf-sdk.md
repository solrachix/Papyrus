---
title: Open Source PDF SDK for Web & React Native
description: Open source PDF SDK for JavaScript and mobile teams, with architecture and evaluation guidance.
---

# Open Source PDF SDK

An open source PDF SDK gives you the building blocks to render, search, and annotate PDF documents while keeping full control over UX, data, and roadmap.

**What it is:** a modular stack for rendering, search, selection, and annotations.  
**Who it's for:** product teams building document readers on web or mobile.  
**When to use:** you need full UX control and long-term ownership.  
**When not to use:** you need heavy PDF editing or enterprise compliance features out of the box.

## Use cases

- In-app document readers (contracts, manuals, reports).
- Knowledge products that ship on web and React Native.
- White-labeled viewers that must match your brand.

Papyrus is actively developed as a modular SDK on NPM, with separate packages for core logic, engines, and UI. It is designed for production readers, not demos.

## What you get from a PDF SDK

- Rendering and text layer support for selection, highlights, and outlines.
- Reader UI components like toolbars, sidebars, and pagination.
- State and events for annotations, search, and navigation.
- Theming so the viewer matches your product.

## High-level architecture

Papyrus is designed as a composable stack:

- **Core:** shared state + events for reader UX.
- **Engines:** PDF.js on web and native PDF on mobile.
- **UI kits:** React and React Native components.

## How Papyrus fits

Papyrus is an open source PDF SDK with a shared core, pluggable engines, and UI kits for React and React Native. It focuses on real reader workflows: selection, search, highlights, and annotations.

Key points:

- MIT license with no usage caps.
- Engine-agnostic core (PDF.js on web, native on mobile).
- Ready-to-use UI components for web and mobile readers.
- Multi-format support (PDF, EPUB, TXT) if your roadmap needs it.

## How it compares to other PDF SDKs

- **Engine-only stacks (PDF.js only):** fast to start, but you still build UI and state.
- **Commercial PDF SDKs:** strong features, but licensing and lock-in.
- **Closed-source viewers:** limited customization and long-term control.
- **Papyrus:** open source, composable, and built for reader UX.

## Evaluation checklist

- Open source license with clear terms
- Rendering quality and text layer accuracy
- Search, outline, and page navigation
- Annotations and selection events
- Web and mobile parity
- Active docs and examples

If you're evaluating an open source PDF SDK for a real product, the best way to validate fit is to run the quickstart and test your core reader flows.

## Next steps

- [Quickstart](/quickstart)
- [Architecture](/architecture)
- [Configuration](/configuration)
- [Mobile](/mobile)
- [Papyrus vs PDFTron](/papyrus-pdftron-alternative)
- [Best Free PDF SDK 2026](/best-free-pdf-sdk-2026)
- [Open Source EPUB SDK](/open-source-epub-sdk)

---
title: Comparisons
description: Compare Papyrus with common document-reader approaches using practical capabilities.
---

# Comparisons

Choosing a document reader is not only a rendering benchmark. Engine coverage, search, annotations, mobile integration, customization, licensing, and ownership of the UI all affect the fit.

## Capability overview

| Capability | Papyrus | PDF engine + custom UI | Commercial reader SDK |
| --- | --- | --- | --- |
| Pluggable engine contract | Included | You design it | Depends on vendor |
| Reader UI | React and React Native packages | You build and maintain it | Usually included |
| PDF, EPUB, TXT flows | Shared Papyrus contracts | Usually separate integrations | Depends on product |
| Search, thumbnails, themes | Shared viewer features | You assemble the pieces | Often included |
| Source-level customization | MIT source | Full control | Limited by SDK surface |
| Vendor lock-in | Low | Low | Higher |
| Native/mobile bridge | Available in the Papyrus packages | You maintain the bridge | Usually vendor-specific |

This table is an architectural orientation, not a claim that every product in a category has identical capabilities.

## Existing comparisons

- [Papyrus vs PDFTron / Apryse](/papyrus-pdftron-alternative)
- [Open Source PDF SDK](/open-source-pdf-sdk)
- [Open Source EPUB SDK](/open-source-epub-sdk)
- [Best Free PDF SDK 2026](/best-free-pdf-sdk-2026)

## How to compare performance fairly

Use the same document, browser or device, engine version, warm/cold state, and operation. Report page-load time, first visible page, text extraction, search latency, memory, and bundle size separately. Papyrus benchmark results should be published with the document and command used so they can be reproduced.

Start with the [interactive demo](/demo), then use the [quickstart](/quickstart) to test the integration in your own application.

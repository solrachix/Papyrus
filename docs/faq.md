---
title: Papyrus FAQ
description: Answers about the open source PDF, EPUB, and TXT SDK for web and mobile document readers.
head:
  - - script
    - type: application/ld+json
    - |
        {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          "mainEntity": [
            {
              "@type": "Question",
              "name": "What is Papyrus?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Papyrus is an open source document SDK with a shared core, pluggable engines, and UI kits for React and React Native."
              }
            },
            {
              "@type": "Question",
              "name": "Which formats are supported?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Papyrus supports PDF, EPUB, and TXT. On mobile, EPUB and TXT use WebView while PDF stays native."
              }
            },
            {
              "@type": "Question",
              "name": "Does it work with React and React Native?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Yes. Papyrus ships UI layers for React on web and React Native on mobile."
              }
            },
            {
              "@type": "Question",
              "name": "Can I swap the PDF engine?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Yes. The core is engine-agnostic so you can swap PDF.js, PDFium, or native engines without changing UI logic."
              }
            },
            {
              "@type": "Question",
              "name": "Does it support search and annotations?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Yes. The core exposes events, state, and search hooks for building highlights, notes, and reader workflows."
              }
            },
            {
              "@type": "Question",
              "name": "Is it free for commercial use?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Yes. Papyrus is MIT licensed."
              }
            }
          ]
        }
---

# Papyrus FAQ

Direct answers for teams evaluating an open source PDF, EPUB, and TXT SDK.

## What is Papyrus?
Papyrus is an open source document SDK that ships a shared core, pluggable engines, and UI kits for React and React Native.

## Which formats are supported?
PDF, EPUB, and TXT. On mobile, EPUB/TXT use WebView while PDF stays native.

## Does it work with React and React Native?
Yes. Web UI ships as `@papyrus-sdk/ui-react` and mobile UI ships as `@papyrus-sdk/ui-react-native`.

## Can I swap the PDF engine?
Yes. The core is engine-agnostic, so you can swap PDF.js, PDFium, or native engines without changing UI logic.

## Does it support search and annotations?
Yes. The core exposes events, state, and search hooks for building highlights, notes, and reader workflows.

## Is it free for commercial use?
Yes. Papyrus is MIT licensed. See `LICENSE` for details.

## Next steps
- [Quickstart](/quickstart)
- [Configuration](/configuration)
- [Best Free PDF SDK 2026](/best-free-pdf-sdk-2026)

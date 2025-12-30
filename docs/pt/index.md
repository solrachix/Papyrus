---
layout: home
title: Papyrus
titleTemplate: false
hero:
  name: Papyrus
  text: SDK modular de documentos
  tagline: Monte leitura, busca e anotacoes para PDF, EPUB e TXT.
  actions:
    - theme: brand
      text: Quickstart
      link: /pt/quickstart
    - theme: alt
      text: Arquitetura
      link: /pt/architecture
features:
  - title: Engine agnostica
    details: Use PDF.js no web e PDFKit ou PDFium no mobile sem trocar a UI.
  - title: PDF, EPUB, TXT
    details: Mesma UI entre formatos, com EPUB/TXT via WebView no mobile.
  - title: Core orientado a eventos
    details: useViewerStore e papyrusEvents unificam estado, acoes e ciclo de vida.
  - title: UI pronta
    details: Camadas React e React Native com busca, sumario e temas.
  - title: Configuravel
    details: PapyrusConfig cobre pagina inicial, zoom, tema, accent e anotacoes.
---

## O que existe no monorepo

- `@papyrus-sdk/types`: contratos de engine, anotacoes e eventos.
- `@papyrus-sdk/core`: store e eventos para o app.
- `@papyrus-sdk/engine-pdfjs`: engine web via PDF.js.
- `@papyrus-sdk/ui-react`: UI web com Topbar, Sidebars e Viewer.
- `@papyrus-sdk/engine-native`: bridge nativa para iOS e Android.
- `@papyrus-sdk/ui-react-native`: UI mobile com sheets e toolbars.

## Por que Papyrus

Papyrus foi pensado para experiencias de documentos com UX profissional:
busca, selecao, anotacao e UI customizavel sobre um core estavel.

## Proximos passos

- Comece aqui: [Quickstart](/pt/quickstart)
- Entenda as camadas: [Arquitetura](/pt/architecture)
- Configure temas e comportamento: [Configuracao](/pt/configuration)
- Mobile: [Mobile](/pt/mobile)

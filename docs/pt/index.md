---
layout: home
title: Papyrus
titleTemplate: false
description: SDK open source de PDF, EPUB e TXT para leitores de documentos web e mobile.
hero:
  name: Papyrus
  text: SDK open source de PDF/EPUB/TXT
  tagline: Monte leitores com busca, anotacoes e temas para web e mobile (React + React Native).
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

Papyrus e um SDK open source de PDF, EPUB e TXT para experiencias de documentos com UX profissional:
busca, selecao, anotacao e UI customizavel sobre um core estavel.

## Snippet rapido

Instale e renderize um viewer PDF com o SDK:

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

- Leitura e anotacao de especificacoes, pesquisa e documentos de produto.
- Bases de conhecimento com busca em PDF, EPUB e TXT.
- Revisao juridica e compliance com destaques e notas.
- Educacao e e-learning com navegacao confiavel por pagina e sumario.
- Publishing com leitor embarcavel e identidade visual da marca.

## FAQ

### Papyrus e um SDK open source de PDF/EPUB/TXT?
Sim. O Papyrus e um SDK open source que oferece uma UI unificada e engines para PDF, EPUB e TXT.

### Posso trocar a engine de PDF?
Sim. A arquitetura e agnostica, entao voce pode usar PDF.js, PDFium ou engines nativas sem mudar a UI.

### Funciona com React e React Native?
Sim. O Papyrus tem camadas de UI para React no web e React Native no mobile.

### Suporta anotacoes e busca?
Sim. O core inclui eventos, estado de anotacoes e hooks para montar fluxos de leitura.

## Feito para times que entregam UX de leitura

Papyrus foca no fluxo real de documentos: selecao, destaques, busca e anotacoes,
mantendo detalhes de engine atras de uma API consistente. Se voce precisa de um SDK open source
de PDF para web ou mobile, este e o bloco central.

## Proximos passos

- Comece aqui: [Quickstart](/pt/quickstart)
- Entenda as camadas: [Arquitetura](/pt/architecture)
- Configure temas e comportamento: [Configuracao](/pt/configuration)
- FAQ: [FAQ](/pt/faq)
- SDK PDF Open Source: [SDK PDF Open Source](/pt/sdk-pdf-open-source)
- SDK EPUB Open Source: [SDK EPUB Open Source](/pt/sdk-epub-open-source)
- Melhor SDK PDF Gratis 2026: [Melhor SDK PDF Gratis 2026](/pt/melhor-sdk-pdf-gratis-2026)
- Mobile: [Mobile](/pt/mobile)

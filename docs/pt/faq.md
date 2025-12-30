---
title: FAQ do Papyrus
description: Respostas sobre o SDK open source de PDF, EPUB e TXT para leitores web e mobile.
---

# FAQ do Papyrus

Respostas diretas para quem avalia um SDK open source de PDF, EPUB e TXT.

## O que e o Papyrus?
Papyrus e um SDK open source de documentos com core compartilhado, engines plugaveis e UI para React e React Native.

## Quais formatos sao suportados?
PDF, EPUB e TXT. No mobile, EPUB/TXT usam WebView enquanto PDF fica nativo.

## Funciona com React e React Native?
Sim. A UI web esta em `@papyrus-sdk/ui-react` e a UI mobile em `@papyrus-sdk/ui-react-native`.

## Posso trocar a engine de PDF?
Sim. O core e agnostico, entao voce pode usar PDF.js, PDFium ou engines nativas sem mudar a UI.

## Suporta busca e anotacoes?
Sim. O core expone eventos, estado e hooks de busca para criar destaques, notas e fluxos de leitura.

## E gratuito para uso comercial?
Sim. O Papyrus tem licenca MIT. Veja `LICENSE`.

## Proximos passos
- [Quickstart](/pt/quickstart)
- [Configuracao](/pt/configuration)
- [Melhor SDK PDF Gratis 2026](/pt/melhor-sdk-pdf-gratis-2026)

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "O que e o Papyrus?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Papyrus e um SDK open source de documentos com core compartilhado, engines plugaveis e UI para React e React Native."
      }
    },
    {
      "@type": "Question",
      "name": "Quais formatos sao suportados?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Papyrus suporta PDF, EPUB e TXT. No mobile, EPUB e TXT usam WebView enquanto PDF fica nativo."
      }
    },
    {
      "@type": "Question",
      "name": "Funciona com React e React Native?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Sim. O Papyrus tem camadas de UI para React no web e React Native no mobile."
      }
    },
    {
      "@type": "Question",
      "name": "Posso trocar a engine de PDF?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Sim. O core e agnostico, entao voce pode usar PDF.js, PDFium ou engines nativas sem mudar a UI."
      }
    },
    {
      "@type": "Question",
      "name": "Suporta busca e anotacoes?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Sim. O core expone eventos, estado e hooks de busca para criar destaques, notas e fluxos de leitura."
      }
    },
    {
      "@type": "Question",
      "name": "E gratuito para uso comercial?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Sim. O Papyrus tem licenca MIT."
      }
    }
  ]
}
</script>

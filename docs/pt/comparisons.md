---
title: Comparativos
description: Compare o Papyrus com abordagens comuns de leitores de documentos por capacidades praticas.
---

# Comparativos

Escolher um leitor de documentos nao depende apenas de benchmark de renderizacao. Engines, busca, anotacoes, integracao mobile, customizacao, licenca e controle da UI tambem importam.

## Visao geral de capacidades

| Capacidade | Papyrus | Engine PDF + UI propria | SDK comercial de leitura |
| --- | --- | --- | --- |
| Contrato de engine plugavel | Incluido | Voce projeta | Depende do fornecedor |
| UI de leitor | Pacotes React e React Native | Voce constroi e mantem | Normalmente incluida |
| Fluxos PDF, EPUB e TXT | Contratos compartilhados | Integracoes normalmente separadas | Depende do produto |
| Busca, miniaturas e temas | Recursos compartilhados | Voce monta as pecas | Frequentemente incluidos |
| Customizacao no codigo-fonte | Codigo MIT | Controle total | Limitada pela API do SDK |
| Lock-in de fornecedor | Baixo | Baixo | Maior |
| Bridge nativa/mobile | Disponivel nos pacotes Papyrus | Voce mantem a bridge | Normalmente especifica do fornecedor |

Esta tabela e uma orientacao arquitetural, nao uma afirmacao de que todos os produtos de uma categoria possuem exatamente os mesmos recursos.

## Comparativos existentes

- [Papyrus vs PDFTron / Apryse](/pt/papyrus-alternativa-pdftron)
- [SDK PDF Open Source](/pt/sdk-pdf-open-source)
- [SDK EPUB Open Source](/pt/sdk-epub-open-source)
- [Melhor SDK PDF Gratis 2026](/pt/melhor-sdk-pdf-gratis-2026)

## Como comparar performance de forma justa

Use o mesmo documento, navegador ou dispositivo, versao da engine e estado frio/quente. Relate separadamente tempo de carregamento, primeira pagina visivel, extracao de texto, latencia de busca, memoria e tamanho do bundle. Resultados do Papyrus devem incluir o documento e o comando usados para permitir reproducao.

Comece pelo [demo interativo](/pt/demo) e use o [quickstart](/pt/quickstart) para testar a integracao na sua aplicacao.

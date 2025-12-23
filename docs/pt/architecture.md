# Arquitetura

Papyrus e dividido em camadas pequenas para UI e engine evoluirem separadas.

## Pacotes

| Pacote | Papel |
| --- | --- |
| `@papyrus-sdk/types` | Contratos (DocumentEngine, Annotation, eventos). |
| `@papyrus-sdk/core` | Store + eventos (`useViewerStore`, `papyrusEvents`). |
| `@papyrus-sdk/engine-pdfjs` | Adapter web sobre PDF.js. |
| `@papyrus-sdk/ui-react` | UI web de leitura, busca e navegacao. |
| `@papyrus-sdk/engine-native` | Bridge nativa (iOS e Android). |
| `@papyrus-sdk/ui-react-native` | UI mobile com sheets e toolbars. |

## Fluxo de dados

1. A engine carrega o documento e expor pagina, outline e texto.
2. A UI chama metodos da engine e atualiza o store.
3. `papyrusEvents` emite eventos para o app.

## Engine agnostica

Os componentes de UI conversam apenas com `DocumentEngine`. Isso permite
trocar PDF.js por PDFKit ou PDFium sem refazer a UI.

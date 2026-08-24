---
title: "Arquitetura"
description: "Papyrus e dividido em camadas pequenas para UI e engine evoluirem separadas."
---
# Arquitetura

Papyrus e dividido em camadas pequenas para UI e engine evoluirem separadas.

## Pacotes

| Pacote | Papel |
| --- | --- |
| `@papyrus-sdk/types` | Contratos (DocumentEngine, Annotation, eventos). |
| `@papyrus-sdk/core` | Store + eventos (`useViewerStore`, `papyrusEvents`). |
| `@papyrus-sdk/engine-pdfjs` | Adapter web sobre PDF.js. |
| `@papyrus-sdk/engine-cbz` | Adapter web para quadrinhos CBZ usando ZIP/zip.js. |
| `@papyrus-sdk/engine-cbr` | Adapter web para quadrinhos CBR usando RAR/libarchive. |
| `@papyrus-sdk/engine-cbz-rust` | Adapter experimental CBZ com Rust/WASM e fallback para zip.js. |
| `@papyrus-sdk/ui-react` | UI web de leitura, busca e navegacao. |
| `@papyrus-sdk/engine-native` | Bridge nativa (iOS e Android). |
| `@papyrus-sdk/ui-react-native` | UI mobile com sheets e toolbars. |

## Fluxo de dados

1. A engine carrega o documento e expor pagina, outline e texto.
2. A UI chama metodos da engine e atualiza o store.
3. `papyrusEvents` emite eventos para o app.

## Engine agnostica

Os componentes de UI conversam apenas com `DocumentEngine`. Isso permite
trocar PDF.js por PDFKit ou PDFium sem refazer a UI, e trocar a implementação
de quadrinhos entre `CBZEngine`, `CBREngine` e a engine experimental Rust/WASM.

Na web, a rota de demonstração `engine=rust-cbz` usa o núcleo Rust/WASM para
listar e extrair páginas CBZ. Se o WASM não inicializar, o adapter reutiliza o
fluxo `zip.js`. A rota `engine=cbz` permanece disponível como baseline.

CBR ainda usa `libarchive.js`. Uma engine Rust para RAR/CBR não faz parte da
integração atual e só deve ser adotada depois de um benchmark específico de
compatibilidade, extração, memória e tamanho do artefato.

## Integração com React Native em monorepo

O SDK não controla a configuração do Metro do app consumidor. Em um monorepo
com pnpm, configure o Metro para que `@papyrus-sdk/core` resolva para uma única
instalação física compartilhada pelo app e por
`@papyrus-sdk/ui-react-native` (por exemplo, usando um mapeamento explícito em
`extraNodeModules`/`resolveRequest`). Duas instâncias do core criam stores
separados: o documento pode informar um `pageCount` válido enquanto o
visualizador PDF nativo permanece em branco por observar outra store. Depois
de alterar versões dos pacotes ou a configuração do Metro, reinicie o Metro
com cache limpo e faça o rebuild do app nativo.

# Desenho livre em EPUB — Papyrus

## Contexto

O pacote já persiste marcações de texto EPUB com âncoras CFI e redesenha essas marcações dentro do documento refluível. O dock também já oferece a ferramenta `ink`, mas o caminho atual de desenho é específico de páginas PDF. Esta mudança deve tornar a ferramenta de tinta funcional no EPUB sem armazenar coordenadas de tela como localização definitiva.

## Objetivo

Permitir desenhar traços livres sobre o conteúdo EPUB com dedo ou Apple Pencil quando a ferramenta de tinta estiver ativa. Ao sair desse modo, seleção de texto e navegação/rolagem voltam ao comportamento atual. O traço deve acompanhar o texto quando o leitor alterar fonte, tamanho ou modo de paginação.

## Alternativas consideradas

1. **Overlay preso à viewport/página atual.** É simples e produz um traço preciso no momento da escrita, mas desloca a anotação ou a deixa na página errada depois do reflow. Rejeitada como formato persistido.
2. **Um CFI para o parágrafo ou trecho, com geometria relativa única.** Gera poucos dados, mas pode distorcer ou perder a forma do desenho quando o trecho quebra em linhas diferentes.
3. **Amostras do traço ancoradas a glifos por CFI, com deslocamento local relativo a cada glifo.** Cada ponto é recalculado a partir do texto correspondente depois do reflow. É a opção recomendada; ocupa mais espaço e o traço pode se deformar ligeiramente quando a tipografia muda.

## Desenho recomendado

### Modo de interação

- Usar a ferramenta `ink` já disponível no ToolDock para entrar no modo caneta do EPUB.
- No modo caneta, capturar um gesto primário de um único ponteiro dentro do documento da seção EPUB ativa. O gesto não deve selecionar texto, rolar ou virar página. Se um segundo toque iniciar um gesto multitoque, cancelar o traço ativo para preservar o gesto multitoque do leitor.
- Não calcular CFI durante cada movimento. Durante o gesto, registrar coordenadas brutas e desenhar apenas uma prévia incremental; ao terminar, simplificar os pontos e só então localizar âncoras.
- Limitar a memória de gestos excepcionalmente longos: ao exceder 2.048 amostras brutas, compactar para 1.024 pontos preservando início e fim antes da simplificação final.
- Fora do modo caneta, não interceptar os gestos de leitura existentes.
- Manter os controles atuais de cor, opacidade, largura, desfazer e refazer.

### Localização eficiente e continuidade

- Manter um índice espacial uniforme dos retângulos de fragmentos de texto por documento de conteúdo. Construí-lo fora do caminho de movimento e atualizá-lo quando o conteúdo reflowar, mudar de tamanho ou carregar fontes; uma amostra simplificada consulta somente células próximas.
- Ancorar cada amostra ao glifo textual próximo por CFI e guardar o deslocamento local normalizado pelo tamanho do glifo.
- Usar um limite máximo de distância tipográfica: `clamp(12px, 0.8 × altura da linha, 28px)`. Amostras mais distantes do texto não serão ancoradas; elas encerram um segmento em vez de criar um salto grande no desenho.
- Simplificar a polilinha ao concluir o gesto, mantendo início/fim e pontos de curvatura. Armazenar segmentos contínuos separados e renderizar cada segmento com suavização. Se pontos consecutivos ficarem excessivamente distantes após um reflow, quebrar o segmento também durante a renderização.
- Conservar `rect` e `path` compatíveis com a anotação `ink` existente como prévia/fallback estático para consumidores antigos. Esses campos não serão usados para posicionar a tinta no runtime EPUB atualizado; `epub-ink` continuará sendo a fonte de verdade.

### Modelo persistido

- Manter `Annotation.type = "ink"` e o `anchor.kind = "epub-cfi"` conhecido pelo app/API atuais. O anchor aponta para o primeiro ponto ancorado e mantém `quote`, `href` e `documentId`, permitindo que versões antigas validem e naveguem até o início do desenho.
- Guardar a geometria nova em um campo complementar `Annotation.epubInk`, com `version: 1`, `kind: "epub-ink"`, identidade do documento quando o consumidor fornecer uma, e segmentos por `href`/spine. Cada amostra terá um CFI de um glifo próximo, o texto desse glifo e `x`/`y` normalizados em relação ao retângulo do glifo. Os deslocamentos podem ultrapassar o retângulo, para que traços feitos em margens/próximo ao texto continuem representáveis, mas respeitarão o limite de distância acima.
- A geometria `rect`/`pageIndex` legada da anotação não será usada para posicionar tinta EPUB. O âncora CFI será a fonte de verdade após qualquer reflow.
- Também manter `rect` e `path` legados, normalizados na geometria do gesto original, para que consumidores antigos que ignoram o novo âncora ainda consigam exibir uma prévia estática da anotação.
- Limitar e simplificar o número de amostras antes de enviar a anotação pelo bridge, rejeitando payloads inválidos ou excessivos.

### Captura, bridge e renderização

- Capturar amostras e desenhar a prévia no runtime do WebView; enviar à aplicação uma única anotação ao concluir o gesto, evitando uma mensagem nativa por ponto.
- Validar sessão do documento, identidade, CFI, quantidade de segmentos/pontos e limites numéricos antes de incluir a anotação no store. A persistência continua pelo evento comum `ANNOTATION_CREATED`.
- Confirmar serialização JSON sem perda e reabertura a partir de `initialAnnotations`; manter um `anchor.kind = "epub-cfi"` válido e fallback `rect`/`path` para consumidores que não reconhecem o campo `epubInk`. A API atual valida o anchor conhecido e conserva o objeto completo no JSONB; não atualizar `thoth-stack` nesta etapa.
- Confirmar que as mudanças no store que desfazem/refazem anotações EPUB alteram o snapshot `annotations` observado pelo fluxo de persistência comum, além do histórico de tinta PDF.
- Fazer undo/redo emitir eventos coerentes de criação/atualização/exclusão para consumidores que persistem por `papyrusEvents`; testar também que o snapshot de estado conserva a âncora completa.
- Resolver cada CFI no documento corrente e recalcular a posição a partir do retângulo do glifo. Desenhar o caminho em overlay SVG sem interceptar taps fora do modo caneta.
- Atualizar o overlay quando o runtime reaplicar as anotações, após resize/reflow, mudança de fonte/tema e mudança de capítulo; remover listeners e prévias em troca/fechamento do documento.
- Desenhos iniciados em uma seção/iframe não atravessarão para outra seção no mesmo gesto. A pessoa pode continuar o desenho com um novo gesto.

## Fora do escopo

- Tinta livre em PDF, quadrinhos, páginas escaneadas sem texto ou um editor independente de PencilKit.
- Borracha por partes do traço, pressão/inclinação da caneta e edição dos pontos depois de salvo.
- Garantir geometria idêntica depois de mudanças tipográficas: a meta é manter o traço ancorado ao texto correspondente.

## Riscos e validação

- A implementação depende dos eventos de toque que o `WKWebView` encaminha ao runtime EPUB. A captura deve continuar sujeita a smoke test em iPhone/iPad, pois não temos dispositivo iOS disponível nesta sessão.
- Texto extraído, CFI e testes de DOM não comprovam sozinhos a aparência final do traço ou a coexistência com os gestos do `WKWebView`.
- A validação deverá incluir serialização/reabertura, consumidores antigos, captura/cancelamento/sessão, undo/redo, reflow em mudanças extremas de fonte, índice atualizado depois de reflow e uma medição reproduzível com centenas de pontos. Testes automatizados não substituem smoke test de dedo/Apple Pencil em WKWebView real.
- O pacote UI React Native precisará ser reconstruído e publicado antes de o consumidor receber o recurso; publicação npm e builds de distribuição ficam explicitamente fora desta etapa.

## Exemplo serializado

O anchor principal continua usando o formato conhecido; o sidecar é um campo adicional e opcional para consumidores antigos:

```json
{
  "type": "ink",
  "anchor": {
    "version": 1,
    "kind": "epub-cfi",
    "cfiRange": "epubcfi(/6/2!/4/2:0)",
    "href": "chapter.xhtml",
    "quote": "A",
    "documentId": "edition-123"
  },
  "epubInk": {
    "version": 1,
    "kind": "epub-ink",
    "documentId": "edition-123",
    "segments": [{
      "href": "chapter.xhtml",
      "spineIndex": 0,
      "points": [
        {"cfiRange": "epubcfi(/6/2!/4/2:0)", "quote": "A", "x": 0.2, "y": 0.1},
        {"cfiRange": "epubcfi(/6/2!/4/2:1)", "quote": "n", "x": 0.4, "y": 0.1}
      ]
    }]
  },
  "rect": {"x": 0.2, "y": 0.1, "width": 0.02, "height": 0.01},
  "path": [{"x": 0.2, "y": 0.1}, {"x": 0.22, "y": 0.11}]
}
```

## Escopo da alteração

Implementar no Papyrus, principalmente em `packages/types`, `packages/core/annotationAnchors.ts`, `packages/core/store.ts`, `packages/ui-react-native/runtime/epubAnnotations.js`, o bridge EPUB e a integração de `WebViewViewer`/`ToolDock`. Atualizar o runtime agregado via o script já existente do pacote. Não alterar `thoth-stack` nesta etapa. Não publicar npm nem iniciar builds de distribuição; deixar o release para uma etapa posterior depois de revisar o diff e validar o pacote.

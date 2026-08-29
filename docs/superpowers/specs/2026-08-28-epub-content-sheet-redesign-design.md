# Redesign da sheet de conteúdo do EPUB

## Objetivo

Redesenhar a navegação de conteúdo do leitor mobile para que a sheet de EPUB
tenha uma aparência editorial, legível e coerente com o tema do leitor, sem
reintroduzir previews de páginas ou alterar o comportamento de navegação.

## Contexto atual

- A sheet é renderizada por `RightSheet` usando `NativeSheet`.
- EPUB não possui páginas fixas nem previews de miniaturas; sua navegação deve
  ser baseada no outline/capítulos.
- PDF e CBZ/CBR continuam usando a grade de miniaturas existente.
- O pill de progresso abre a navegação de conteúdo para EPUB e é clicável em
  toda a sua área.

## Direção visual

Usar o modo editorial claro do Papyrus como referência de marca:

- tema claro: superfície marfim/fria muito clara, texto azul-marinho, divisores
  azul-acinzentados e azul Papyrus como único destaque forte;
- tema escuro: carvão/navy, texto creme e o mesmo azul de destaque;
- dourado fica restrito a detalhes pequenos, sem competir com o estado ativo;
- tipografia com hierarquia clara, números tabulares e labels discretos;
- sombras suaves e bordas internas sutis, sem aparência de modal genérico;
- espaçamento generoso para leitura e toque confortável.

O resultado deve parecer um índice de livro, não um painel técnico de páginas.

## Estrutura da interface

1. A sheet mantém o comportamento de fechamento por backdrop e botão voltar do
   sistema, além da altura já corrigida. O redesign adiciona um botão de fechar
   explícito no cabeçalho, usando o mesmo `onClose`.
2. O cabeçalho exibe “Conteúdo”, o indicador `atual/total` e o controle de
   fechamento.
3. O seletor “Páginas / Conteúdo” não aparece para EPUB.
4. O conteúdo é uma lista vertical de capítulos, com:
   - área de toque em toda a linha;
   - título com até duas linhas;
   - marcador numérico/ordinal discreto;
   - estado ativo visível por faixa lateral, peso tipográfico e cor de destaque;
   - divisores leves entre itens.
5. A lista permanece rolável e, ao abrir, começa no item ativo quando ele puder
   ser identificado. A árvore do outline é percorrida em ordem de documento.
   Um `pageIndex` válido é um inteiro entre `0` e `pageCount - 1`. O item ativo
   é o último item navegável, nessa ordem, cujo `pageIndex` seja menor ou igual
   a `currentPage - 1` (conversão explícita do contador 1-based para o índice
   0-based). Em empate, vence o item mais profundo e, persistindo o empate, o
   último na ordem de documento. Se nenhum item for identificável, a lista
   começa no topo. Essa regra não altera o scroll do documento.
6. Os estados da lista são explícitos:
   - outline com itens: renderiza a hierarquia existente, preservando filhos;
   - outline vazio após o carregamento: exibe o estado vazio localizado já
     disponível;
   - item sem `pageIndex` válido: continua visível, recebe estado acessível de
     desabilitado e não executa ação de navegação;
   - falha de navegação: a UI não cria um erro paralelo; a chamada usa o
     `jumpToPage` existente e qualquer falha segue o logging/contrato atual da
     engine;
   - loading/erro de carregamento: não serão inventados nesta sheet, pois o
     componente recebe o outline já resolvido pelo store; uma futura camada de
     carregamento deverá fornecer estado próprio antes de renderizar a sheet.

## Tema e tokens

Os estilos devem derivar de `uiTheme` e `accentColor` já fornecidos pelo store.
Não criar uma paleta paralela nem forçar dark mode. Os tokens específicos da
sheet devem ficar agrupados no próprio componente ou em um helper local testável.

## Semântica do progresso

`currentPage/pageCount` continuam significando a posição de navegação exposta
pela engine EPUB. Eles não serão apresentados como número físico de página. O
contador do cabeçalho mantém o contrato visual atual (`atual/total`) e a lista
usa o outline como fonte dos capítulos; os dois totais podem divergir em EPUBs
com mais de um capítulo na mesma seção. A navegação continua usando o
`pageIndex` já exposto pelo outline e leva ao início da seção correspondente;
esta mudança não adiciona suporte a `href` ou âncoras específicas.

## Comportamento preservado

- toque em qualquer capítulo chama a navegação existente e fecha a sheet;
- o pill continua abrindo a sheet;
- toque longo no pill continua abrindo o salto de página;
- PDF, CBZ e CBR não mudam de layout;
- nenhuma chamada de preview ou renderização extra é feita para EPUB;
- acessibilidade mantém labels localizados, usa `accessibilityRole="button"`,
  informa `accessibilityState.selected` para o item ativo,
  `accessibilityState.disabled` para destinos inválidos e mantém alvos de toque
  de pelo menos 44 pontos.

## Testes e validação

- teste unitário para garantir que EPUB não oferece miniaturas;
- teste de interação do pill inteiro;
- teste determinístico da regra de item ativo com contador 1-based/índice
  0-based, hierarquia e empates;
- teste do estado ativo e de itens sem destino navegável;
- teste de fechamento por controle explícito e backdrop;
- teste de que nenhum `getPagePreview` é chamado para EPUB;
- testes existentes de layout, runtime e estado continuam passando;
- build Android do exemplo mobile;
- validação visual no emulador Pixel 7 em tema claro e escuro;
- no teste manual, abrir o EPUB local fornecido pelo usuário
  (`fabulas-de-esopo-papel-ptbr.epub`) quando disponível, verificar que os
  capítulos aparecem, que a lista rola e que tocar em um capítulo navega para
  o início da seção; a unidade automatizada usará um outline sintético para
  não depender de um arquivo pessoal;
- repetir a verificação para PDF e CBZ/CBR para garantir que a grade de
  miniaturas não mudou.

## Fora de escopo

- gerar miniaturas ou screenshots de páginas EPUB;
- alterar a engine EPUB ou o fluxo de scroll contínuo;
- redesenhar PDF, CBZ/CBR, topbar ou bottom bar;
- adicionar dependências visuais novas.

## Limite técnico

A implementação fica restrita a `packages/ui-react-native/components` e seus
testes. Não haverá alteração no store global, na engine EPUB ou no bridge
WebView, exceto se um contrato de acessibilidade já existente exigir ajuste
local.

Esta especificação substitui a expectativa anterior de uma grade de previews
para EPUB; PDF e CBZ/CBR mantêm a grade existente.

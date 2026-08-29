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

1. A sheet mantém o comportamento de fechamento e a altura já corrigida.
2. O cabeçalho exibe “Conteúdo”, o indicador `atual/total` e o botão de fechar
   já existente.
3. O seletor “Páginas / Conteúdo” não aparece para EPUB.
4. O conteúdo é uma lista vertical de capítulos, com:
   - área de toque em toda a linha;
   - título com até duas linhas;
   - marcador numérico/ordinal discreto;
   - estado ativo visível por faixa lateral, peso tipográfico e cor de destaque;
   - divisores leves entre itens.
5. A lista permanece rolável e conserva o capítulo atual visível quando a sheet
   é aberta, sempre que isso for possível sem alterar o scroll do documento.
6. Outline vazio exibe um estado vazio composto, com mensagem curta e sem
   deixar a sheet visualmente quebrada.

## Tema e tokens

Os estilos devem derivar de `uiTheme` e `accentColor` já fornecidos pelo store.
Não criar uma paleta paralela nem forçar dark mode. Os tokens específicos da
sheet devem ficar agrupados no próprio componente ou em um helper local testável.

## Comportamento preservado

- toque em qualquer capítulo chama a navegação existente e fecha a sheet;
- o pill continua abrindo a sheet;
- toque longo no pill continua abrindo o salto de página;
- PDF, CBZ e CBR não mudam de layout;
- nenhuma chamada de preview ou renderização extra é feita para EPUB;
- acessibilidade mantém label de navegação e torna cada capítulo acionável.

## Testes e validação

- teste unitário para garantir que EPUB não oferece miniaturas;
- teste de interação do pill inteiro;
- testes existentes de layout, runtime e estado continuam passando;
- build Android do exemplo mobile;
- validação visual no emulador Pixel 7 em tema claro e escuro;
- verificar que os 14 capítulos do EPUB de teste aparecem, que a lista rola e
  que tocar em um capítulo navega para ele.

## Fora de escopo

- gerar miniaturas ou screenshots de páginas EPUB;
- alterar a engine EPUB ou o fluxo de scroll contínuo;
- redesenhar PDF, CBZ/CBR, topbar ou bottom bar;
- adicionar dependências visuais novas.

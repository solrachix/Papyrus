# Seleção de texto e ícones das notas

## Objetivo

Corrigir a seleção móvel para respeitar limites de linha ao arrastar entre
linhas e alinhar os ícones da barra de ações e da aba de notas ao conjunto
Lucide fornecido pelo produto.

## Comportamento de seleção

Ao arrastar da primeira linha para uma linha abaixo, a seleção deverá conter:

1. o trecho da primeira linha desde o ponto inicial até o fim da linha;
2. todas as linhas intermediárias completas;
3. o trecho da última linha desde o início até o ponto final do dedo.

O comportamento deverá ser equivalente ao arrastar para cima e ao mover as
alças inicial e final. A seleção dentro de uma única linha continuará limitada
aos pontos exatos do gesto.

O cálculo será orientado por linhas e produzirá segmentos independentes. O
retângulo envolvente único não será usado como fonte da seleção final, pois ele
inclui texto indevido nas linhas inicial e final. Android nativo e o
`PageRenderer` compartilhado pelo iOS deverão seguir o mesmo contrato de
seleção.

## Ícones

Adicionar ao catálogo compartilhado os caminhos SVG Lucide para:

- `PencilLine`;
- `Copy`;
- `Underline`;
- `MessageSquareQuote`;
- `Quote`.

Os componentes manterão as propriedades existentes de tamanho, cor e
espessura de traço. A barra de ações da seleção usará `PencilLine`, `Copy`,
`Underline` e `MessageSquareQuote` nas ações correspondentes.

## Aba de notas

O conteúdo de cada nota será apresentado com citação decorativa no formato:

`[Quote invertido] ... texto... [Quote normal]`

O primeiro `Quote` será espelhado horizontalmente. O segundo manterá a
orientação original. Os dois serão decorativos e não alterarão o conteúdo
armazenado da anotação.

## Validação

- testes unitários para seleção na mesma linha, descida, subida e movimento
  das alças;
- teste de renderização/estrutura para os novos componentes de ícone e para a
  composição da nota;
- build do pacote React Native;
- testes unitários Android;
- smoke test no emulador Android quando o ADB estiver operacional.

## Escopo

As mudanças ficarão limitadas ao fluxo de seleção, ao catálogo de ícones, à
barra de ações e à apresentação da aba de notas. Alterações locais não
relacionadas existentes no worktree serão preservadas.

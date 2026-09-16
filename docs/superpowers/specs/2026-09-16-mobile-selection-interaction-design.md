# Interação de seleção de texto no leitor mobile

## Objetivo

Corrigir a interação de seleção de texto para que, no Android e no iOS:

1. trechos que atravessam linhas sejam selecionados corretamente;
2. tocar fora da seleção desselecione sem disparar ações de página
   (não abrir Páginas, não alternar o chrome);
3. o scroll continue funcionando normalmente com ou sem seleção ativa;
4. a seleção deixe de parecer "travada": sem alças inertes, sem fila de
   extrações e com a barra de ações aparecendo já no primeiro gesto.

Este spec complementa `2026-09-16-selection-icons-design.md` (contrato de
`start`/`end` e seleção por linhas). O recorte por linhas no C++ e o caminho
por linhas no bridge iOS permanecem; o foco aqui é o gesto, o estado e a
sincronização entre UI, JS e engine.

## Modelo de gesto aprovado

Modelo "padrão de leitor", igual nas duas plataformas:

| Gesto | Resultado |
| --- | --- |
| Double-tap no texto | seleciona a **palavra** sob o dedo e mostra a barra de ações imediatamente |
| Tocar fora da seleção | desseleciona; nenhuma ação de página é disparada nesse toque |
| Tocar dentro da seleção | mantém a seleção; se virar arrasto além do threshold, desseleciona e rola |
| Arrastar a partir de uma alça | estende/reduz a seleção respeitando linhas |
| Arrastar fora (sem seleção) | scroll normal |
| Arrastar fora (com seleção) | limpa a seleção e rola |
| Scroll/fling | limpa a seleção (mesma regra do `onScroll` do JS) |

O modo "selecionar" armado no `ToolDock` (`interactionMode: "select"`)
continua existindo no iOS/`PageRenderer` e não regride. No Android nativo ele
não é necessário para o double-tap.

## Contrato e engine

- Nenhum tipo novo: o contrato `DocumentEngine.selectText(pageIndex, rect,
  endpoints?)` de `@papyrus-sdk/types` permanece.
- Convenção de palavra: quando `endpoints.start` e `endpoints.end` são
  **exatamente iguais** (double-tap), o engine deve tratar como seleção de
  ponto e expandir para a palavra sob o ponto. Arrastos de verdade têm
  distância mínima de gesto e nunca caem nessa igualdade.
- Engines sem suporte a endpoints continuam usando o retângulo legado; o
  retângulo continua sendo apenas fallback e moldura, nunca a regra final.

### C++ (`papyrus_text_search.cpp`)

- Manter o agrupamento de glifos em linhas e o recorte por intervalo
  direcional já implementado (primeira linha do ponto inicial até o fim,
  intermediárias inteiras, última do início até o ponto final).
- No caso mesma-linha com `start == end`, expandir para os limites da palavra:
  caminhar para a esquerda e para a direita enquanto o caractere for de
  palavra (letras Unicode básicas, dígitos, `'`, `’`, `-`), usando as caixas
  reais dos glifos; retornar o segmento dessa linha.
- Se o ponto não estiver sobre nenhuma palavra, retornar seleção vazia
  (nenhum retângulo, texto vazio).

### iOS (`PapyrusNativeEngine.m`)

- O caminho por endpoints atual descarta `right <= left`, então double-tap
  (`start == end`) retornaria vazio. Adicionar o ramo de palavra antes do
  caminho por linhas:
  - obter o índice do caractere com o ponto convertido para coordenadas de
    página;
  - expandir sobre `page.string` com a mesma classificação de caractere de
    palavra;
  - montar a seleção com `selectionForRange:` e converter o bounds para
    retângulos normalizados com a mesma convenção top-left usada no restante
    do bridge.
- O caminho existente para `start != end` permanece inalterado.

## Android nativo

Arquivos principais: `PapyrusPdfViewerView.java`,
`PapyrusTextSelectionGesture.java` (regras puras),
`PapyrusTextSelectionGestureTest.java`.

### Regras puras (testáveis)

- `resolveDoubleTap(now, lastTapTime, dx, dy, density, timeoutMs)`: true
  somente dentro da janela (`ViewConfiguration.getDoubleTapTimeout()`, 300 ms)
  e da distância máxima em dp. A view lê a configuração e injeta `timeoutMs`.
- `shouldDismissSelectionOnTouch({ hasSelection, hitHandle, insideSelection })`:
  - `hitHandle` → não limpa (inicia arrasto de alça);
  - `insideSelection` → não limpa;
  - caso contrário com `hasSelection` → limpa.
- `shouldSuppressPageTap(hasSelectionAtDown)`: se havia seleção no DOWN, o
  toque inteiro não emite page tap (nem ao desselecionar, nem ao tocar
  dentro).
- `shouldStartScrollFromSelection(insideSelection, distance, density)`: arrasto
  além do threshold limpa e rola.

### Máquina de estados do touch (`select` tool)

- **IDLE**
  - Tap curto: agenda `pendingSingleTap` com delay
    `doubleTapTimeout + 50 ms`, cancelável.
  - Segundo tap dentro da janela: cancela o page tap, seleciona a palavra,
    entra em `SELECTING` e emite `onTextSelected` quando o resultado chegar.
- **SELECTING** (com retângulos pintados)
  - DOWN em alça (alvo de toque de 24 dp; desenho continua 10 dp) →
    `DRAG_HANDLE`.
  - DOWN dentro da seleção → mantém; tap no UP não emite page tap; arrasto
    além do threshold limpa, emite `onTextSelected` vazio e rola.
  - DOWN fora → limpa no DOWN, emite `onTextSelected` vazio, suprime o page
    tap do gesto; arrasto rola normalmente.
- **DRAG_HANDLE**
  - Atualiza `selectStart*`/`selectEnd*` e pede nova seleção (coalescida).
  - UP emite `onTextSelected` com o estado final; CANCEL limpa o drag sem
    perder a seleção.

### Coalescing das extrações PDFium

- Substituir o disparo por movimento (que enfileira uma extração por evento)
  por "último pedido vence":
  - um única extração em voo por vez no `SELECT_EXECUTOR`;
  - novos pedidos apenas sobrescrevem os parâmetros pendentes;
  - ao terminar, o runner pega o pedido mais recente, se houver;
  - o resultado só é aplicado se a versão ainda for a mais recente.
- `performTextSelection(boolean emitWhenReady)`: double-tap usa
  `emitWhenReady = true`; arrasto de alça usa `false` (emite no UP). Resultado
  vazio com `emitWhenReady` emite `onTextSelected` vazio para o JS não manter
  uma barra de ações órfã.

### Erros e casos vazios

- Sem engine/documento ou `PapyrusTextSelect.AVAILABLE == false`: nenhuma
  seleção é criada e nenhum page tap é suprimido.
- Double-tap em espaço em branco: seleção vazia, nenhuma barra aparece.
- Toque em anotação durante seleção: a seleção é limpa pelo DOWN; o tap de
  anotação continua funcionando (só o page tap é suprimido).

## iOS / `PageRenderer` compartilhado

Arquivo principal: `packages/ui-react-native/components/PageRenderer.tsx`.

- **Double-tap**: `selectAtPoint` passa `endpoints` com `start == end`
  (normalizados), mantendo o retângulo de 26 px como fallback para engines
  legadas.
- **Tap fora**: substituir a caixa generosa atual por
  `isPointInsideSelectionUi` — bounds da seleção + padding de 12 px,
  considerando também a área da barra de ações (os botões já consomem o
  próprio toque com `stopPropagation`). Fora disso: `clearSelection()` e
  retorno antes de `onPageTap`.
- **Preview do arrasto**: limitar as atualizações de estado a ~32 ms por
  atualização para reduzir custo de `runOnJS` + `setState` por frame. O
  resultado final continua sendo calculado apenas no release.
- **Scroll**: nenhuma mudança de contrato; as alças continuam capturando
  apenas o próprio toque e o arrasto do modo "selecionar" continua bloqueando
  o scroll enquanto ativo (`shouldEnableViewerScroll`).

Novo helper testável em `components/selectionContentInteraction.ts`:
`isPointInsideSelectionUi({ point, bounds, padding })`.

## Testes

- **Java** (`PapyrusTextSelectionGestureTest`): janela/distância do
  double-tap; dismiss fora vs. dentro vs. alça; supressão de page tap com
  seleção ativa; scroll a partir de dentro da seleção além do threshold.
- **JS** (`selectionInteraction.test.mjs` e
  `selectionContentInteraction.test.ts`): `isPointInsideSelectionUi` com
  padding e pontos fora; manter os casos existentes de
  `resolveSelectionDragRect` e `shouldDismissSelectionOnContentInteraction`.
- **C++/Obj-C**: sem harness unitário neste repositório; validação pelo build
  Android e smoke real, e por revisão do bridge iOS.

## Validação

- `npx vitest run` para os testes JS afetados.
- `examples/mobile/android`: `./gradlew :papyrus_engine_native:testDebugUnitTest`
  e `:app:assembleDebug`; instalar no POCO (`6fe88ef10000`).
- Smoke roteirizado via ADB/scrcpy no POCO:
  1. double-tap numa palavra → seleção aparece com barra de ações;
  2. tap fora → seleção some e a folha Páginas **não** abre;
  3. tap dentro → seleção permanece;
  4. arrastar alça por múltiplas linhas → seleção por linha correta;
  5. scroll com seleção ativa → limpa e rola sem travar.
- iOS: sem simulador no ambiente Linux; validação por testes compartilhados e
  revisão do bridge, registrado como limitação.

## Escopo

Limitado ao gesto, estado e sincronização da seleção: `PapyrusPdfViewerView`,
`PapyrusTextSelectionGesture` (+ teste), `papyrus_text_search.cpp`,
`PapyrusNativeEngine.m`, `PageRenderer.tsx`,
`selectionContentInteraction.ts` (+ testes). Ícones/notas do worktree,
cache de glifos, pinch/zoom e ink ficam fora. As alterações locais não
relacionadas já presentes no worktree devem ser preservadas.

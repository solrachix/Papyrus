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
| Scroll/fling | limpa a seleção (regra do `onScroll` do JS no Android; no iOS a seleção permanece até tocar fora ou usar a barra) |
| Double-tap com seleção ativa | substitui a seleção pela palavra tocada |

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
- Extrair a lógica de palavra para uma unidade pura, sem PDFium, em
  `papyrus_text_word.h/.cpp`:
  - `bool isWordCharacter(char16_t)`;
  - `resolveWordRange(const std::vector<char16_t>& text, int index)` →
    `[start, end)` da palavra que contém `index`.
- No caso mesma-linha com `start == end`, expandir para os limites da palavra
  usando `resolveWordRange` sobre os caracteres da página e as caixas reais
  dos glifos; retornar o segmento dessa linha.
- Predicado de "caractere de palavra", idêntico no C++ e no Obj-C
  (implementação explícita em ambos, sem depender de tabelas de plataforma):
  - ASCII `A-Z`, `a-z`, `0-9`;
  - apóstrofo `'` (U+0027), apóstrofo curvo `’` (U+2019) e hífen `-` (U+002D);
  - Latin-1 Supplement com acentos: U+00C0–U+00D6, U+00D8–U+00F6,
    U+00F8–U+00FF;
  - Latin Extended-A: U+0100–U+017F.
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
- A expansão de palavra usa o mesmo predicado de caractere documentado na
  seção do C++, aplicado sobre `page.string`.

## Android nativo

Arquivos principais: `PapyrusPdfViewerView.java`,
`PapyrusTextSelectionGesture.java` (regras puras),
`PapyrusTextSelectionGestureTest.java`.

### Regras puras (testáveis)

- `resolveDoubleTap(now, lastTapTime, dx, dy, timeoutMs, maxDistancePx)`: true
  somente dentro da janela e da distância máxima; a view injeta
  `timeoutMs = ViewConfiguration.getDoubleTapTimeout()` (300 ms) e
  `maxDistancePx = 20 dp × density`, mantendo o valor atual.
- `shouldDismissSelectionOnTouch({ hasSelection, hitHandle, insideSelection })`:
  - `hitHandle` → não limpa (inicia arrasto de alça);
  - `insideSelection` → não limpa; o critério é o ponto estar dentro de algum
    retângulo de `selectedRects` inflado em 8 dp;
  - caso contrário com `hasSelection` → limpa.
- `shouldSuppressPageTap(hasSelectionAtDown)`: se havia seleção no DOWN, o
  toque inteiro não emite page tap (nem ao desselecionar, nem ao tocar
  dentro).
- `shouldStartScrollFromSelection(insideSelection, distance, thresholdPx)`;
  a view injeta `thresholdPx = 12 dp × density` (mesmo `TAP_MAX_DISTANCE_DP`
  atual).

Regras existentes: `shouldEmitPageTap(isDoubleTap)` permanece e continua
decidindo entre page tap e seleção; `shouldActivate(isDoubleTap)` permanece;
`shouldContinueAfterSelectionTouch` é substituída por
`shouldDismissSelectionOnTouch` e sai do código junto com seus testes.

### Máquina de estados do touch (`select` tool)

- **IDLE**
  - Tap curto: agenda `pendingSingleTap` com delay
    `doubleTapTimeout + 50 ms`, cancelável; ao vencer, emite page tap (ou tap
    de anotação quando o ponto cai sobre uma anotação), respeitando a
    supressão.
  - Segundo tap dentro da janela: cancela o page tap, seleciona a palavra,
    entra em `SELECTING` e emite `onTextSelected` quando o resultado chegar.
  - `lastTapTime`/`lastTapX`/`lastTapY` são atualizados em todo UP curto,
    mesmo quando a supressão de page tap está ativa, para o double-tap
    continuar detectável.
- **SELECTING** (com retângulos pintados)
  - DOWN em alça (alvo de toque com **raio de 24 dp**; desenho continua
    10 dp) → `DRAG_HANDLE`.
  - DOWN dentro da seleção → mantém; tap no UP não emite page tap; arrasto
    além do threshold limpa, emite `onTextSelected` vazio e rola.
  - DOWN fora → limpa no DOWN, emite `onTextSelected` vazio, suprime o page
    tap do gesto; arrasto rola normalmente.
  - Double-tap (dentro ou fora da seleção) → substitui a seleção pela palavra
    do novo ponto.
- **DRAG_HANDLE**
  - Atualiza `selectStart*`/`selectEnd*` e pede nova seleção (coalescida).
  - UP pede a extração final com `emitWhenReady = true` e a emissão acontece
    quando o resultado mais recente for aplicado — inclusive vazio, para o JS
    não manter uma barra órfã; CANCEL limpa o drag sem perder a seleção.

### Coalescing das extrações PDFium

- Substituir o disparo por movimento (que enfileira uma extração por evento)
  por "último pedido vence":
  - uma única extração em voo por vez no `SELECT_EXECUTOR`;
  - novos pedidos apenas sobrescrevem os parâmetros pendentes;
  - ao terminar, o runner pega o pedido mais recente, se houver;
  - o resultado só é aplicado se a versão ainda for a mais recente.
- `performTextSelection(boolean emitWhenReady)`: double-tap e UP do arrasto de
  alça usam `emitWhenReady = true`; movimentos do arrasto usam `false`. Um
  pedido com `emitWhenReady` emite `onTextSelected` (mesmo vazio) quando seu
  resultado é aplicado, garantindo que o JS reflita sempre o estado final.
  `emitTextSelected` deixa de retornar cedo quando `selectedRects` está vazio
  nesses caminhos.

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
  legadas. Com uma seleção ativa, o double-tap em outra palavra **substitui**
  a seleção: remover o early-return atual de `handleDoubleTap` quando
  `selectionRects.length > 0 || selectionBounds`, limpando a seleção anterior
  antes de selecionar a nova palavra.
- **Tap fora**: substituir a caixa generosa atual por
  `isPointInsideSelectionUi`, que recebe os retângulos de hit-test
  (`hitRects`) e um padding de 12 px; o `PageRenderer` monta a lista com o
  bounds da seleção e o retângulo da barra de ações no mesmo formato do
  cálculo atual (`max(220, larguraDaSeleção) × 56` px, ancorado abaixo ou
  acima do bounds). Fora disso: `clearSelection()` e retorno antes de
  `onPageTap`. Os botões da barra já consomem o próprio toque com
  `stopPropagation`.
- **Preview do arrasto**: limitar as atualizações de estado a ~32 ms por
  atualização para reduzir custo de `runOnJS` + `setState` por frame. O
  resultado final continua sendo calculado apenas no release.
- **Scroll**: nenhuma mudança de contrato; as alças continuam capturando
  apenas o próprio toque e o arrasto do modo "selecionar" continua bloqueando
  o scroll enquanto ativo (`shouldEnableViewerScroll`).

Novo helper testável em `components/selectionContentInteraction.ts`:
`isPointInsideSelectionUi({ point, hitRects, padding })` — verdadeiro se o
ponto estiver dentro de qualquer retângulo de `hitRects` inflado pelo padding.

## Testes

- **Java** (`PapyrusTextSelectionGestureTest`): janela/distância do
  double-tap; dismiss fora vs. dentro vs. alça; supressão de page tap com
  seleção ativa; scroll a partir de dentro da seleção além do threshold.
- **JS** (`selectionInteraction.test.mjs` e
  `selectionContentInteraction.test.ts`): `isPointInsideSelectionUi` com
  padding e pontos fora; manter os casos existentes de
  `resolveSelectionDragRect` e `shouldDismissSelectionOnContentInteraction`.
- **C++**: `papyrus_text_word.h/.cpp` é puro e ganha teste hospedeiro no
  padrão já existente `PAPYRUS_OUTLINE_HOST_TESTS` do `CMakeLists.txt`
  (`papyrus_text_word_test.cpp` + `add_test`), cobrindo acentos, hífen,
  apóstrofo, limites e caracteres fora de palavra; adicionar o alias
  `PAPYRUS_CPP_HOST_TESTS` (default OFF) que habilita esse bloco, com
  comentário no CMake para o comando continuar autoexplicativo. O restante de
  `papyrus_text_search.cpp` é acoplado ao PDFium/JNI e segue validado por
  build + smoke.
- **Obj-C**: sem harness unitário; validação por revisão do bridge e smoke
  quando houver dispositivo/simulador; neste ambiente Linux, revisão mais os
  testes compartilhados.

## Validação

- `npx vitest run` para os testes JS afetados.
- Host test C++ no padrão existente:
  `cmake -S packages/engine-native/android/src/main/cpp -B tmp/papyrus-selection-tests -DPAPYRUS_CPP_HOST_TESTS=ON`
  seguido de build e `ctest --test-dir tmp/papyrus-selection-tests`.
- `examples/mobile/android`: `./gradlew :papyrus_engine_native:testDebugUnitTest`
  e `:app:assembleDebug`; instalar no POCO (`6fe88ef10000`).
- Smoke roteirizado via ADB/scrcpy no POCO:
  1. double-tap numa palavra → seleção aparece com barra de ações;
  2. tap fora → seleção some e a folha Páginas **não** abre;
  3. tap dentro → seleção permanece;
  4. arrastar alça por múltiplas linhas → seleção por linha correta;
  5. scroll com seleção ativa → limpa e rola sem travar;
  6. double-tap em "dinamicamente"/"just-in-time"/"compilação" → a palavra
     inteira (acentos e hífen incluídos) é selecionada.
- O texto do PDF de amostra pode não conter palavras acentuadas/hifenizadas:
  nesse caso, gerar um fixture pequeno com o script existente
  (`pnpm fixtures:mobile`) ou usar um documento com essas palavras, sem
  commitar o artefato.
- iOS: sem simulador no ambiente Linux; validação por testes compartilhados e
  revisão do bridge, registrado como limitação.
- Sequência de implementação por plataforma (Android nativo → engine iOS →
  `PageRenderer`) para que cada unidade seja verificável isoladamente.

## Escopo

Limitado ao gesto, estado e sincronização da seleção: `PapyrusPdfViewerView`,
`PapyrusTextSelectionGesture` (+ teste), `papyrus_text_search.cpp`,
`papyrus_text_word.h/.cpp` (+ teste e `CMakeLists.txt`),
`PapyrusNativeEngine.m`, `PageRenderer.tsx`,
`selectionContentInteraction.ts` (+ testes). O
`DedicatedAndroidPdfViewer.tsx` entra apenas se a supressão do page tap exigir
ajuste no `onTap`/`onScroll` do JS; nenhuma mudança de layout da barra está
prevista. Ícones/notas do worktree, cache de glifos, pinch/zoom e ink ficam
fora. As alterações locais não relacionadas já presentes no worktree devem ser
preservadas.

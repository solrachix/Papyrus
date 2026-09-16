# Corrigir interação de seleção de texto no leitor mobile — Plano de implementação

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o double-tap selecionar a palavra, tocar fora desselecionar sem disparar page tap, manter o scroll funcionando e remover o travamento da seleção no Android nativo e no iOS/`PageRenderer`.

**Architecture:** As regras de gesto saem do touch handler e viram funções puras testáveis (`PapyrusTextSelectionGesture.java`, `selectionContentInteraction.ts`, `papyrus_text_word.h/.cpp`). O viewer Android nativo troca o disparo de seleção por movimento por uma fila "último pedido vence" e emite `onTextSelected` sempre que o estado final é aplicado. O engine (C++ PDFium e bridge Obj-C) expande `start == end` para a palavra sob o ponto; o `PageRenderer` passa endpoints no double-tap e restringe o tap-outside aos retângulos reais da UI da seleção.

**Tech Stack:** TypeScript, React Native, React Native SVG, Java, JNI/C++ PDFium, Objective-C PDFKit, Vitest, JUnit, CMake/CTest, Gradle, ADB/scrcpy.

**Spec:** `docs/superpowers/specs/2026-09-16-mobile-selection-interaction-design.md`

**Nota sobre o worktree:** o worktree já contém, não commitada, a base de
seleção por linhas/endpoints (`start`/`end`) da sessão anterior. Os commits
deste plano incluem essa base nos arquivos que ela toca; alterações locais de
outros arquivos (ícones, notas, safe area) não devem entrar nos commits.

**Skills:** @test-driven-development @verification-before-completion @react-native-scrcpy-control

---

## Chunk 1: Regras puras e engine (Java, C++ e bridge iOS)

### Task 1.1: Regras puras do gesto Android (TDD)

**Files:**
- Modify: `packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusTextSelectionGesture.java`
- Test: `packages/engine-native/android/src/test/java/com/papyrus/engine/PapyrusTextSelectionGestureTest.java`

- [ ] **Step 1: Escrever os testes que falham**

Substituir o conteúdo de `PapyrusTextSelectionGestureTest.java` por:

```java
package com.papyrus.engine;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class PapyrusTextSelectionGestureTest {
  @Test
  public void singleTapDoesNotActivateTextSelection() {
    assertFalse(PapyrusTextSelectionGesture.shouldActivate(false));
  }

  @Test
  public void doubleTapActivatesTextSelection() {
    assertTrue(PapyrusTextSelectionGesture.shouldActivate(true));
  }

  @Test
  public void confirmedSingleTapEmitsPageTapButDoubleTapDoesNot() {
    assertTrue(PapyrusTextSelectionGesture.shouldEmitPageTap(false));
    assertFalse(PapyrusTextSelectionGesture.shouldEmitPageTap(true));
  }

  @Test
  public void doubleTapInsideWindowAndDistanceIsAccepted() {
    assertTrue(
      PapyrusTextSelectionGesture.resolveDoubleTap(1000L, 800L, 10f, 10f, 300L, 60f)
    );
  }

  @Test
  public void doubleTapBeyondWindowIsRejected() {
    assertFalse(
      PapyrusTextSelectionGesture.resolveDoubleTap(1200L, 800L, 0f, 0f, 300L, 60f)
    );
  }

  @Test
  public void doubleTapBeyondDistanceIsRejected() {
    assertFalse(
      PapyrusTextSelectionGesture.resolveDoubleTap(1000L, 800L, 70f, 0f, 300L, 60f)
    );
  }

  @Test
  public void firstEverTapIsNotADoubleTap() {
    assertFalse(
      PapyrusTextSelectionGesture.resolveDoubleTap(1000L, 0L, 0f, 0f, 300L, 60f)
    );
  }

  @Test
  public void touchOutsideSelectionDismissesIt() {
    assertTrue(
      PapyrusTextSelectionGesture.shouldDismissSelectionOnTouch(true, false, false)
    );
  }

  @Test
  public void touchOnHandleDoesNotDismissSelection() {
    assertFalse(
      PapyrusTextSelectionGesture.shouldDismissSelectionOnTouch(true, true, false)
    );
  }

  @Test
  public void touchInsideSelectionDoesNotDismissIt() {
    assertFalse(
      PapyrusTextSelectionGesture.shouldDismissSelectionOnTouch(true, false, true)
    );
  }

  @Test
  public void touchWithoutSelectionDoesNotDismissAnything() {
    assertFalse(
      PapyrusTextSelectionGesture.shouldDismissSelectionOnTouch(false, false, false)
    );
  }

  @Test
  public void pageTapIsSuppressedWheneverASelectionExistedAtDown() {
    assertTrue(PapyrusTextSelectionGesture.shouldSuppressPageTap(true));
    assertFalse(PapyrusTextSelectionGesture.shouldSuppressPageTap(false));
  }

  @Test
  public void draggingInsideSelectionBeyondThresholdScrolls() {
    assertTrue(
      PapyrusTextSelectionGesture.shouldStartScrollFromSelection(true, 40f, 30f)
    );
    assertFalse(
      PapyrusTextSelectionGesture.shouldStartScrollFromSelection(true, 20f, 30f)
    );
    assertFalse(
      PapyrusTextSelectionGesture.shouldStartScrollFromSelection(false, 40f, 30f)
    );
  }

  @Test
  public void draggingAcrossLinesKeepsTheFingerCoordinate() {
    assertEquals(
      0.42f,
      PapyrusTextSelectionGesture.resolveSelectionEndpoint(0.42f),
      0.0001f
    );
  }

  @Test
  public void draggingTheEndHandleToAnotherLineCompletesThePreviousLine() {
    assertEquals(
      1f,
      PapyrusTextSelectionGesture.resolveSelectionEndpoint(0.42f, true, false),
      0.0001f
    );
  }

  @Test
  public void draggingTheStartHandleToAnotherLineCompletesTheFollowingLine() {
    assertEquals(
      0f,
      PapyrusTextSelectionGesture.resolveSelectionEndpoint(0.42f, true, true),
      0.0001f
    );
  }

  @Test
  public void draggingWithinTheSameLineKeepsTheFingerCoordinate() {
    assertEquals(
      0.42f,
      PapyrusTextSelectionGesture.resolveSelectionEndpoint(0.42f, false, false),
      0.0001f
    );
  }
}
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `cd examples/mobile/android && ./gradlew :papyrus_engine_native:testDebugUnitTest --tests "com.papyrus.engine.PapyrusTextSelectionGestureTest"`
Expected: FAIL na compilação (`cannot find symbol: resolveDoubleTap` etc.).

- [ ] **Step 3: Implementar as regras**

Substituir o conteúdo de `PapyrusTextSelectionGesture.java` por:

```java
package com.papyrus.engine;

/** Small, platform-independent rules for the PDF text-selection gesture. */
final class PapyrusTextSelectionGesture {
  private PapyrusTextSelectionGesture() {}

  static boolean shouldActivate(boolean isDoubleTap) {
    return isDoubleTap;
  }

  static boolean shouldEmitPageTap(boolean isDoubleTap) {
    return !isDoubleTap;
  }

  /** A touch that starts on a handle or inside the selection keeps it. */
  static boolean shouldDismissSelectionOnTouch(
    boolean hasSelection,
    boolean hitHandle,
    boolean insideSelection
  ) {
    return hasSelection && !hitHandle && !insideSelection;
  }

  /** A touch that starts with a painted selection never becomes a page tap. */
  static boolean shouldSuppressPageTap(boolean hadSelectionAtDown) {
    return hadSelectionAtDown;
  }

  /** Dragging inside the selection past the threshold dismisses it and scrolls. */
  static boolean shouldStartScrollFromSelection(
    boolean insideSelection,
    float distance,
    float thresholdPx
  ) {
    return insideSelection && distance > thresholdPx;
  }

  static boolean resolveDoubleTap(
    long now,
    long lastTapTime,
    float dx,
    float dy,
    long timeoutMs,
    float maxDistancePx
  ) {
    if (lastTapTime <= 0) return false;
    if (now - lastTapTime >= timeoutMs) return false;
    return Math.hypot(dx, dy) <= maxDistancePx;
  }

  /** Keep the selection endpoint where the user's finger actually landed. */
  static float resolveSelectionEndpoint(float normalizedX) {
    return Math.max(0f, Math.min(1f, normalizedX));
  }

  /** Complete the line crossed by a selection endpoint. */
  static float resolveSelectionEndpoint(
    float normalizedX,
    boolean crossedLine,
    boolean isStartHandle
  ) {
    if (crossedLine) return isStartHandle ? 0f : 1f;
    return resolveSelectionEndpoint(normalizedX);
  }

  /**
   * Mantido nesta tarefa porque PapyrusPdfViewerView ainda chama este método;
   * será removido na Task 2.2, quando o touch handler for substituído.
   */
  static boolean shouldContinueAfterSelectionTouch(boolean hitHandle) {
    return !hitHandle;
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd examples/mobile/android && ./gradlew :papyrus_engine_native:testDebugUnitTest --tests "com.papyrus.engine.PapyrusTextSelectionGestureTest"`
Expected: BUILD SUCCESSFUL, todos os testes passando.

- [ ] **Step 5: Commit**

```bash
git add packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusTextSelectionGesture.java packages/engine-native/android/src/test/java/com/papyrus/engine/PapyrusTextSelectionGestureTest.java
git commit -m "test(android): define selection gesture rules"
```

### Task 1.2: Unidade pura de palavra em C++ com teste hospedeiro (TDD)

**Files:**
- Create: `packages/engine-native/android/src/main/cpp/papyrus_text_word.h`
- Create: `packages/engine-native/android/src/main/cpp/papyrus_text_word.cpp`
- Create: `packages/engine-native/android/src/main/cpp/papyrus_text_word_test.cpp`
- Modify: `packages/engine-native/android/src/main/cpp/CMakeLists.txt`

- [ ] **Step 1: Escrever o teste que falha**

Criar `papyrus_text_word_test.cpp`:

```cpp
#include "papyrus_text_word.h"

#include <iostream>
#include <vector>

namespace {

int failures = 0;

void ExpectTrue(bool value, const char *name) {
  if (!value) {
    std::cerr << "FAIL: " << name << std::endl;
    failures += 1;
  }
}

void ExpectRange(const std::vector<char16_t> &text, int index, int expectedStart,
                 int expectedEnd, const char *name) {
  const auto range = papyrus::ResolveWordRange(text, index);
  if (range.first != expectedStart || range.second != expectedEnd) {
    std::cerr << "FAIL: " << name << " expected [" << expectedStart << ", "
              << expectedEnd << ") got [" << range.first << ", " << range.second
              << ")" << std::endl;
    failures += 1;
  }
}

}  // namespace

int main() {
  ExpectTrue(papyrus::IsWordCharacter(u'a'), "ascii letter");
  ExpectTrue(papyrus::IsWordCharacter(u'Z'), "ascii upper");
  ExpectTrue(papyrus::IsWordCharacter(u'7'), "digit");
  ExpectTrue(papyrus::IsWordCharacter(0x00E7), "c-cedilla");
  ExpectTrue(papyrus::IsWordCharacter(0x00E3), "a-tilde");
  ExpectTrue(papyrus::IsWordCharacter(u'\''), "apostrophe");
  ExpectTrue(papyrus::IsWordCharacter(0x2019), "curly apostrophe");
  ExpectTrue(papyrus::IsWordCharacter(u'-'), "hyphen");
  ExpectTrue(!papyrus::IsWordCharacter(u' '), "space is not a word char");
  ExpectTrue(!papyrus::IsWordCharacter(u'.'), "dot is not a word char");
  ExpectTrue(!papyrus::IsWordCharacter(u'\n'), "newline is not a word char");

  const std::vector<char16_t> simple = {u'd', u'i', u'n', u'a'};
  ExpectRange(simple, 0, 0, 4, "word from first char");
  ExpectRange(simple, 3, 0, 4, "word from last char");
  ExpectRange(simple, -1, -1, -1, "out of bounds start");
  ExpectRange(simple, 4, 4, 4, "out of bounds end");

  const std::vector<char16_t> accented = {u'c', u'o', u'm', u'p', u'i',
                                          u'l', u'a', 0x00E7, 0x00E3, u'o'};
  ExpectRange(accented, 7, 0, 10, "accented word");

  const std::vector<char16_t> hyphenated = {u'j', u'u', u's', u't', u'-',
                                            u'i', u'n', u'-', u't', u'i',
                                            u'm', u'e'};
  ExpectRange(hyphenated, 5, 0, 12, "hyphenated word");
  ExpectRange(hyphenated, 4, 0, 12, "hyphen is word char");

  const std::vector<char16_t> apostrophe = {u'l', u'\'', 0x00E9, u't'};
  ExpectRange(apostrophe, 1, 0, 4, "apostrophe joins the word");

  const std::vector<char16_t> sentence = {u'a', u' ', u'b', u'.', u'c'};
  ExpectRange(sentence, 1, 1, 1, "space yields empty range");
  ExpectRange(sentence, 3, 3, 3, "dot yields empty range");

  if (failures > 0) {
    std::cerr << failures << " failure(s)" << std::endl;
    return 1;
  }
  std::cout << "papyrus_text_word_test: OK" << std::endl;
  return 0;
}
```

- [ ] **Step 2: Registrar o teste e o alvo no CMake**

Em `CMakeLists.txt`, substituir a linha:

```cmake
option(PAPYRUS_OUTLINE_HOST_TESTS "Build host tests for the outline loader" OFF)
```

por:

```cmake
option(PAPYRUS_OUTLINE_HOST_TESTS "Build host tests for the outline loader" OFF)
# Alias geral para todos os testes C++ puros (inclui o outline loader).
option(PAPYRUS_CPP_HOST_TESTS "Build all pure C++ host tests" OFF)
```

e adicionar `papyrus_text_word.cpp` à biblioteca Android:

```cmake
  add_library(papyrus_text SHARED
    papyrus_text_search.cpp
    papyrus_outline.cpp
    papyrus_outline_loader.cpp
    papyrus_text_word.cpp
  )
```

Trocar o bloco final `if(PAPYRUS_OUTLINE_HOST_TESTS)` por:

```cmake
if(PAPYRUS_OUTLINE_HOST_TESTS OR PAPYRUS_CPP_HOST_TESTS)
  enable_testing()

  add_executable(papyrus_outline_loader_test
    papyrus_outline_loader.cpp
    papyrus_outline_loader_test.cpp
  )

  papyrus_set_cxx17(papyrus_outline_loader_test)
  add_test(NAME papyrus_outline_loader_test COMMAND papyrus_outline_loader_test)

  add_executable(papyrus_text_word_test
    papyrus_text_word.cpp
    papyrus_text_word_test.cpp
  )

  papyrus_set_cxx17(papyrus_text_word_test)
  add_test(NAME papyrus_text_word_test COMMAND papyrus_text_word_test)
endif()
```

- [ ] **Step 3: Rodar para ver falhar (na raiz do repo)**

Run:
```bash
cmake -S packages/engine-native/android/src/main/cpp -B tmp/papyrus-selection-tests -DPAPYRUS_CPP_HOST_TESTS=ON
```
Expected: FAIL no configure com `Cannot find source file: papyrus_text_word.cpp` (o arquivo é criado no Step 4).

- [ ] **Step 4: Implementar a unidade**

Criar `papyrus_text_word.h`:

```cpp
#ifndef PAPYRUS_TEXT_WORD_H
#define PAPYRUS_TEXT_WORD_H

#include <cstdint>
#include <utility>
#include <vector>

namespace papyrus {

bool IsWordCharacter(char16_t value);

// Returns [start, end) of the word that contains |index|. When |index| is out
// of bounds or not a word character, returns {index, index}.
std::pair<int, int> ResolveWordRange(const std::vector<char16_t> &text,
                                     int index);

}  // namespace papyrus

#endif  // PAPYRUS_TEXT_WORD_H
```

Criar `papyrus_text_word.cpp`:

```cpp
#include "papyrus_text_word.h"

namespace papyrus {

bool IsWordCharacter(char16_t value) {
  if (value >= u'0' && value <= u'9') return true;
  if (value >= u'A' && value <= u'Z') return true;
  if (value >= u'a' && value <= u'z') return true;
  if (value == u'\'' || value == 0x2019) return true;
  if (value == u'-') return true;
  if (value >= 0x00C0 && value <= 0x00D6) return true;
  if (value >= 0x00D8 && value <= 0x00F6) return true;
  if (value >= 0x00F8 && value <= 0x00FF) return true;
  if (value >= 0x0100 && value <= 0x017F) return true;
  return false;
}

std::pair<int, int> ResolveWordRange(const std::vector<char16_t> &text,
                                     int index) {
  const int size = static_cast<int>(text.size());
  if (index < 0 || index >= size) return {index, index};
  if (!IsWordCharacter(text[index])) return {index, index};

  int start = index;
  while (start > 0 && IsWordCharacter(text[start - 1])) start -= 1;

  int end = index + 1;
  while (end < size && IsWordCharacter(text[end])) end += 1;

  return {start, end};
}

}  // namespace papyrus
```

- [ ] **Step 5: Rodar e ver passar**

Run:
```bash
cmake -S packages/engine-native/android/src/main/cpp -B tmp/papyrus-selection-tests -DPAPYRUS_CPP_HOST_TESTS=ON
cmake --build tmp/papyrus-selection-tests
ctest --test-dir tmp/papyrus-selection-tests --output-on-failure
```
Expected: 2 testes passando (`papyrus_outline_loader_test` e `papyrus_text_word_test`).

- [ ] **Step 6: Commit**

```bash
git add packages/engine-native/android/src/main/cpp/papyrus_text_word.h packages/engine-native/android/src/main/cpp/papyrus_text_word.cpp packages/engine-native/android/src/main/cpp/papyrus_text_word_test.cpp packages/engine-native/android/src/main/cpp/CMakeLists.txt
git commit -m "test(android): add pure word range unit for text selection"
```

### Task 1.3: Expandir double-tap para a palavra no PDFium

**Files:**
- Modify: `packages/engine-native/android/src/main/cpp/papyrus_text_search.cpp`

- [ ] **Step 1: Incluir a unidade e coletar os caracteres da página**

No topo de `papyrus_text_search.cpp`, adicionar após os includes existentes:

```cpp
#include "papyrus_text_word.h"
```

Logo antes de `struct CharBox`, adicionar o vetor que guarda os caracteres em ordem de página:

```cpp
  std::vector<char16_t> pageChars;
```

E, dentro do laço `for (int i = 0; i < charCount; i++)`, logo após `chars.push_back({...});`, adicionar:

```cpp
    pageChars.push_back(static_cast<char16_t>(charBuffer[0]));
```

- [ ] **Step 2: Tratar `start == end` como seleção de palavra**

No bloco `if (hasEndpoints && !lines.empty())`, depois das linhas:

```cpp
    const double startX = std::max(0.0, std::min(1.0, startNormX)) * pageWidth;
    const double endX = std::max(0.0, std::min(1.0, endNormX)) * pageWidth;
    const double startY = std::max(0.0, std::min(1.0, startNormY)) * pageHeight;
    const double endY = std::max(0.0, std::min(1.0, endNormY)) * pageHeight;
```

substituir todo o trecho a partir de `auto findLine = [&](double pdfY) {` até o fechamento do laço `for (int lineIndex = firstLine; ...)` por:

```cpp
    const bool isPointSelection =
        startNormX == endNormX && startNormY == endNormY;
    if (isPointSelection) {
      const double pointX = startX;
      const double pointY = pageHeight - startY;
      int pointChar = -1;
      double bestDistance = std::numeric_limits<double>::max();
      for (int i = 0; i < static_cast<int>(chars.size()); i++) {
        const auto &character = chars[i];
        const bool inside = pointX >= character.left && pointX <= character.right &&
                            pointY >= character.bottom && pointY <= character.top;
        if (inside) {
          pointChar = i;
          break;
        }
        const double dx = std::max({character.left - pointX, pointX - character.right, 0.0});
        const double dy = std::max({character.bottom - pointY, pointY - character.top, 0.0});
        const double distance = dx * dx + dy * dy;
        if (distance < bestDistance) {
          bestDistance = distance;
          pointChar = i;
        }
      }
      if (pointChar >= 0) {
        const auto wordRange = papyrus::ResolveWordRange(pageChars, pointChar);
        for (int i = wordRange.first; i < wordRange.second; i++) {
          selected[i] = true;
        }
      }
    } else {
      auto findLine = [&](double pdfY) {        int best = 0;
        double bestDistance = std::numeric_limits<double>::max();
        for (int i = 0; i < static_cast<int>(lines.size()); i++) {
          const auto &line = lines[i];
          double distance = 0.0;
          if (pdfY > line.top) distance = pdfY - line.top;
          else if (pdfY < line.bottom) distance = line.bottom - pdfY;
          if (distance < bestDistance) {
            best = i;
            bestDistance = distance;
          }
        }
        return best;
      };

      const int startLine = findLine(pageHeight - startY);
      const int endLine = findLine(pageHeight - endY);
      const bool forward = startLine < endLine || (startLine == endLine && startX <= endX);
      const int firstLine = std::min(startLine, endLine);
      const int lastLine = std::max(startLine, endLine);

      for (int lineIndex = firstLine; lineIndex <= lastLine; lineIndex++) {
        const auto &line = lines[lineIndex];
        for (int charIndex : line.chars) {
          const auto &character = chars[charIndex];
          bool include = true;
          if (startLine == endLine) {
            const double left = std::min(startX, endX);
            const double right = std::max(startX, endX);
            include = character.right >= left && character.left <= right;
          } else if (forward) {
            if (lineIndex == startLine) include = character.right >= startX;
            else if (lineIndex == endLine) include = character.left <= endX;
          } else {
            if (lineIndex == startLine) include = character.left <= startX;
            else if (lineIndex == endLine) include = character.right >= endX;
          }
          selected[charIndex] = include;
        }
      }
    }
```

Nota: quando o ponto não cai em nenhum glifo, o Android escolhe o glifo mais
próximo (tolerância para toques em margens/entrelinhas); tocar exatamente em um
espaço não seleciona nada (`ResolveWordRange` devolve vazio). O iOS usa
`characterIndexAtPoint:` e resolve vazio quando o PDFKit não acha caractere —
diferença de plataforma intencional e registrada no spec.

- [ ] **Step 3: Compilar a unidade no host**

Run:
```bash
cmake -S packages/engine-native/android/src/main/cpp -B tmp/papyrus-selection-tests -DPAPYRUS_CPP_HOST_TESTS=ON
cmake --build tmp/papyrus-selection-tests
ctest --test-dir tmp/papyrus-selection-tests --output-on-failure
```
Expected: host tests passam. O `assembleDebug` do Android só roda a partir do Chunk 2: até lá o módulo Java ainda chama `shouldContinueAfterSelectionTouch`/`performTextSelection` (a Task 2.2 reconcilia os dois).

- [ ] **Step 4: Commit**

```bash
git add packages/engine-native/android/src/main/cpp/papyrus_text_search.cpp
git commit -m "feat(android): select the word under a double-tap point"
```

### Task 1.4: Palavra no double-tap pelo bridge iOS

**Files:**
- Modify: `packages/engine-native/ios/PapyrusNativeEngine.m`

- [ ] **Step 1: Adicionar o predicado compartilhado**

No topo do arquivo, depois dos `#import` existentes e antes do primeiro `static`, adicionar:

```objc
static BOOL PapyrusIsWordCharacter(unichar value) {
  if (value >= '0' && value <= '9') return YES;
  if (value >= 'A' && value <= 'Z') return YES;
  if (value >= 'a' && value <= 'z') return YES;
  if (value == '\'' || value == 0x2019) return YES;
  if (value == '-') return YES;
  if (value >= 0x00C0 && value <= 0x00D6) return YES;
  if (value >= 0x00D8 && value <= 0x00F6) return YES;
  if (value >= 0x00F8 && value <= 0x00FF) return YES;
  if (value >= 0x0100 && value <= 0x017F) return YES;
  return NO;
}
```

- [ ] **Step 2: Ramo de palavra antes do caminho por linhas**

No método `selectText:...`, dentro de `if (hasEndpoints) {`, imediatamente após a linha `CGPoint endPoint = pagePointForNormalized(endX, endY);`, inserir:

```objc
    BOOL isPointSelection = fabs(startX - endX) < 1e-9 && fabs(startY - endY) < 1e-9;
    if (isPointSelection) {
      NSString *pageString = page.string ?: @"";
      NSUInteger charIndex = [page characterIndexAtPoint:startPoint];
      if (charIndex != NSNotFound && charIndex < pageString.length &&
          PapyrusIsWordCharacter([pageString characterAtIndex:charIndex])) {
        NSUInteger wordStart = charIndex;
        while (wordStart > 0 &&
               PapyrusIsWordCharacter([pageString characterAtIndex:wordStart - 1])) {
          wordStart -= 1;
        }
        NSUInteger wordEnd = charIndex + 1;
        while (wordEnd < pageString.length &&
               PapyrusIsWordCharacter([pageString characterAtIndex:wordEnd])) {
          wordEnd += 1;
        }
        PDFSelection *wordSelection =
          [page selectionForRange:NSMakeRange(wordStart, wordEnd - wordStart)];
        if (wordSelection && wordSelection.string.length > 0) {
          CGRect wordBounds = [wordSelection boundsForPage:page];
          if (!CGRectIsEmpty(wordBounds)) {
            NSDictionary *rect = nil;
            if (pageView && viewSize.width > 0 && viewSize.height > 0) {
              CGRect viewBounds = [pageView convertRectFromPage:wordBounds page:page];
              rect = @{
                @"x": @(viewBounds.origin.x / viewSize.width),
                @"y": @(viewBounds.origin.y / viewSize.height),
                @"width": @(viewBounds.size.width / viewSize.width),
                @"height": @(viewBounds.size.height / viewSize.height)
              };
            } else {
              CGFloat topLeftY =
                (pageOriginY + pageHeight) - (wordBounds.origin.y + wordBounds.size.height);
              rect = @{
                @"x": @((wordBounds.origin.x - pageOriginX) / pageWidth),
                @"y": @(topLeftY / pageHeight),
                @"width": @(wordBounds.size.width / pageWidth),
                @"height": @(wordBounds.size.height / pageHeight)
              };
            }
            resolve(@{
              @"text": wordSelection.string,
              @"rects": @[rect]
            });
            return;
          }
        }
      }
      resolve([NSNull null]);
      return;
    }
```

- [ ] **Step 3: Verificar que o caminho por linhas não mudou**

Run: `git diff -- packages/engine-native/ios/PapyrusNativeEngine.m | head -160`
Expected: o arquivo já contém a base não commitada do caminho por endpoints
(`hasEndpoints`, `broadLines`, loop por linha). Este commit inclui essa base
junto com o ramo de palavra; assegurar que nenhuma linha dentro do
`for (NSUInteger index = firstLine; ...)` foi alterada.

Não há build iOS neste ambiente Linux; a validação é por revisão e pelos testes compartilhados.

- [ ] **Step 4: Commit**

```bash
git add packages/engine-native/ios/PapyrusNativeEngine.m
git commit -m "feat(ios): select the word under a double-tap point"
```

---

## Chunk 2: Viewer nativo Android

### Task 2.1: Pipeline de seleção coalescido

**Files:**
- Modify: `packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusPdfViewerView.java`

- [ ] **Step 1: Substituir campos de estado da requisição**

Substituir o bloco:

```java
  // Selection handles
  private static final float HANDLE_RADIUS_DP = 10;
  private static final int HANDLE_COLOR = Color.parseColor("#4285F4");
  private int draggedHandle = 0; // 0 = none, -1 = start handle, 1 = end handle
  private long selectionRequestId = 0;
```

por:

```java
  // Selection handles
  private static final float HANDLE_RADIUS_DP = 10;
  private static final float HANDLE_TOUCH_RADIUS_DP = 24;
  private static final int HANDLE_COLOR = Color.parseColor("#4285F4");
  private int draggedHandle = 0; // 0 = none, -1 = start handle, 1 = end handle

  // Coalesced text selection requests ("latest request wins")
  private final Object selectionLock = new Object();
  private boolean selectionRequestInFlight = false;
  private boolean selectionRequestPending = false;
  private boolean selectionRequestEmit = false;
  private long selectionRequestVersion = 0;
  private long selectionRequestQueuedVersion = 0;
  private String selectionRequestEngineId = null;
  private int selectionRequestPage = -1;
  private float selectionRequestRectX = 0f;
  private float selectionRequestRectY = 0f;
  private float selectionRequestRectW = 0f;
  private float selectionRequestRectH = 0f;
  private float selectionRequestStartX = 0f;
  private float selectionRequestStartY = 0f;
  private float selectionRequestEndX = 0f;
  private float selectionRequestEndY = 0f;
```

- [ ] **Step 2: Substituir `performTextSelection()` pelo pipeline coalescido**

Substituir o método `performTextSelection()` inteiro por:

```java
  private void performTextSelection(boolean emitWhenReady) {
    if (selectPageIndex < 0) return;
    PapyrusEngineStore.EngineState state = PapyrusEngineStore.getEngine(engineId);
    if (state == null || state.document == null) return;
    if (!PapyrusTextSelect.AVAILABLE) return;

    synchronized (selectionLock) {
      selectionRequestVersion += 1;
      selectionRequestQueuedVersion = selectionRequestVersion;
      selectionRequestEngineId = engineId;
      selectionRequestPage = selectPageIndex;
      selectionRequestRectX = Math.min(selectStartX, selectEndX);
      selectionRequestRectY = Math.min(selectStartY, selectEndY);
      selectionRequestRectW = Math.max(0.001f, Math.abs(selectEndX - selectStartX));
      selectionRequestRectH = Math.max(0.001f, Math.abs(selectEndY - selectStartY));
      selectionRequestStartX = selectStartX;
      selectionRequestStartY = selectStartY;
      selectionRequestEndX = selectEndX;
      selectionRequestEndY = selectEndY;
      selectionRequestEmit = selectionRequestEmit || emitWhenReady;
      selectionRequestPending = true;
      if (selectionRequestInFlight) return;
      selectionRequestInFlight = true;
    }

    final PapyrusEngineStore.EngineState requestState = state;
    final String sourcePath = state.sourcePath;
    SELECT_EXECUTOR.execute(() -> drainTextSelection(requestState, sourcePath));
  }

  private void drainTextSelection(PapyrusEngineStore.EngineState state, String sourcePath) {
    while (true) {
      int pageIdx;
      float x;
      float y;
      float w;
      float h;
      float startX;
      float startY;
      float endX;
      float endY;
      boolean emit;
      long version;
      String requestEngineId;
      synchronized (selectionLock) {
        if (!selectionRequestPending) {
          selectionRequestInFlight = false;
          return;
        }
        selectionRequestPending = false;
        pageIdx = selectionRequestPage;
        x = selectionRequestRectX;
        y = selectionRequestRectY;
        w = selectionRequestRectW;
        h = selectionRequestRectH;
        startX = selectionRequestStartX;
        startY = selectionRequestStartY;
        endX = selectionRequestEndX;
        endY = selectionRequestEndY;
        emit = selectionRequestEmit;
        selectionRequestEmit = false;
        version = selectionRequestQueuedVersion;
        requestEngineId = selectionRequestEngineId;
      }

      PapyrusTextSelection selection = null;
      try {
        if (sourcePath != null && !sourcePath.isEmpty()) {
          synchronized (state.pdfiumLock) {
            selection = PapyrusTextSelect.nativeSelectTextFile(sourcePath, pageIdx, x, y, w, h, startX, startY, endX, endY);
          }
        } else {
          long docPtr;
          synchronized (state.pdfiumLock) {
            docPtr = extractNativeDocPointer(state.document);
          }
          if (docPtr != 0) {
            synchronized (state.pdfiumLock) {
              selection = PapyrusTextSelect.nativeSelectText(docPtr, pageIdx, x, y, w, h, startX, startY, endX, endY);
            }
          }
        }
      } catch (Throwable ignored) {
      }

      final PapyrusTextSelection finalSelection = selection;
      final long finalVersion = version;
      final String finalEngineId = requestEngineId;
      final int finalPage = pageIdx;
      final boolean finalEmit = emit;
      mainHandler.post(() -> applyTextSelection(
        finalVersion, finalEngineId, finalPage, finalSelection, finalEmit));
    }
  }

  private void applyTextSelection(
    long version,
    String requestEngineId,
    int pageIdx,
    PapyrusTextSelection selection,
    boolean emit
  ) {
    synchronized (selectionLock) {
      if (version != selectionRequestVersion) return;
    }
    if (requestEngineId == null || !requestEngineId.equals(engineId)) return;
    if (!isSelectingText || selectPageIndex != pageIdx) return;

    selectedRects.clear();
    if (selection != null && selection.rects != null && selection.rects.length >= 4) {
      selectedText = selection.text != null ? selection.text : "";
      for (int i = 0; i + 3 < selection.rects.length; i += 4) {
        selectedRects.add(new NormalizedRect(
          selection.rects[i],
          selection.rects[i + 1],
          selection.rects[i + 2],
          selection.rects[i + 3]
        ));
      }
    } else {
      selectedText = "";
      // Movimentos de alça (emit == false) mantêm o gesto vivo para o UP
      // pedir a extração final e emitir o estado vazio.
      if (emit) {
        isSelectingText = false;
        selectPageIndex = -1;
      }
    }
    invalidate();
    if (emit) {
      emitTextSelected();
    }
  }
```

- [ ] **Step 3: Atualizar os chamadores existentes**

Em `handleSelectTouch`, trocar as chamadas de arrasto `performTextSelection();`
por `performTextSelection(false);` e a chamada do ramo de double-tap por
`performTextSelection(true);` (assim o double-tap já emite o estado quando o
resultado chegar, mesmo antes da Task 2.2).

Run: `grep -n "performTextSelection()" packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusPdfViewerView.java`
Expected: nenhuma ocorrência sem argumento.

- [ ] **Step 4: `emitTextSelected` deixa de retornar cedo**

Substituir o início de `emitTextSelected()`:

```java
  private void emitTextSelected() {
    try {
      if (selectedRects.isEmpty()) return;
      WritableMap event = Arguments.createMap();
```

por:

```java
  private void emitTextSelected() {
    try {
      WritableMap event = Arguments.createMap();
```

- [ ] **Step 5: Compilar**

Run: `cd examples/mobile/android && ./gradlew :papyrus_engine_native:assembleDebug`
Expected: BUILD SUCCESSFUL (os chamadores passam `false` e o restante do estado do toque só muda na Task 2.2).

- [ ] **Step 6: Commit**

```bash
git add packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusPdfViewerView.java
git commit -m "refactor(android): coalesce text selection requests"
```

### Task 2.2: Estado do toque (double-tap palavra, dismiss e scroll)

**Files:**
- Modify: `packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusPdfViewerView.java`
- Modify: `packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusTextSelectionGesture.java` (remover `shouldContinueAfterSelectionTouch`)

- [ ] **Step 1: Campos e timeout de double-tap**

Substituir:

```java
  // Double-tap detection for text selection
  private long lastTapTime = 0;
  private float lastTapX = 0;
  private float lastTapY = 0;
  private static final long DOUBLE_TAP_MAX_DELTA_MS = 250;
  private static final float DOUBLE_TAP_MAX_DISTANCE_DP = 20;
  private Runnable pendingSingleTap;
```

por:

```java
  // Double-tap detection for text selection
  private long lastTapTime = 0;
  private float lastTapX = 0;
  private float lastTapY = 0;
  private static final float DOUBLE_TAP_MAX_DISTANCE_DP = 20;
  private final long doubleTapTimeoutMs;
  private Runnable pendingSingleTap;
  private boolean suppressPageTapForGesture = false;
  private boolean insideSelectionAtDown = false;
```

Nos dois construtores, adicionar após a linha do `scaleDetector`:

```java
    doubleTapTimeoutMs = ViewConfiguration.get(context).getDoubleTapTimeout();
```

Adicionar o import `android.view.ViewConfiguration` junto dos imports de `android.view`.

- [ ] **Step 2: Helpers de estado e hit-test**

Adicionar antes de `hitTestHandle`:

```java
  private PageFrame findSelectFrame() {
    if (selectPageIndex < 0) return null;
    for (PageFrame frame : pageFrames) {
      if (frame.index == selectPageIndex) return frame;
    }
    return null;
  }

  private void clearSelectionState() {
    isSelectingText = false;
    selectPageIndex = -1;
    selectedRects.clear();
    selectedText = "";
    draggedHandle = 0;
    invalidate();
  }

  private boolean isPointInsideSelection(float screenX, float screenY, float density) {
    if (selectedRects.isEmpty()) return false;
    PageFrame frame = findSelectFrame();
    if (frame == null) return false;
    float padding = 8f * density;
    for (NormalizedRect rect : selectedRects) {
      float left = frame.left - offsetX + rect.x * frame.width;
      float top = frame.top - offsetY + rect.y * frame.height;
      float right = left + rect.width * frame.width;
      float bottom = top + rect.height * frame.height;
      if (screenX >= left - padding && screenX <= right + padding &&
          screenY >= top - padding && screenY <= bottom + padding) {
        return true;
      }
    }
    return false;
  }

  private void beginWordSelection(float screenX, float screenY) {
    if (!PapyrusTextSelect.AVAILABLE) return;
    PapyrusEngineStore.EngineState state = PapyrusEngineStore.getEngine(engineId);
    if (state == null || state.document == null) return;
    ensureLayout();
    float docX = screenX + offsetX;
    float docY = screenY + offsetY;
    int pageIdx = findPageIndexAt(docX, docY);
    if (pageIdx < 0) return;
    PageFrame frame = pageFrames.get(pageIdx);
    float nx = clamp01((docX - frame.left) / frame.width);
    float ny = clamp01((docY - frame.top) / frame.height);
    isSelectingText = true;
    selectPageIndex = pageIdx;
    selectStartX = nx;
    selectStartY = ny;
    selectEndX = nx;
    selectEndY = ny;
    performTextSelection(true);
  }
```

Em `hitTestHandle`, trocar:

```java
    float radius = HANDLE_RADIUS_DP * density * 1.8f;
```

por:

```java
    float radius = HANDLE_TOUCH_RADIUS_DP * density;
```

e trocar o laço inline de busca do frame por:

```java
    PageFrame frame = findSelectFrame();
    if (frame == null) return 0;
```

- [ ] **Step 3: Substituir o `handleSelectTouch` inteiro**

Substituir o método `handleSelectTouch(MotionEvent event)` inteiro (do `case MotionEvent.ACTION_DOWN:` ao `return true;` final) por:

```java
  private boolean handleSelectTouch(MotionEvent event) {
    float density = getResources().getDisplayMetrics().density;
    switch (event.getActionMasked()) {
      case MotionEvent.ACTION_DOWN: {
        if (event.getPointerCount() > 1) {
          return true; // Multi-touch: ignore, let pinch zoom handle it
        }
        touchDownTime = System.currentTimeMillis();
        touchDownX = event.getX();
        touchDownY = event.getY();
        draggedHandle = 0;
        insideSelectionAtDown = false;

        boolean hasSelection =
          isSelectingText && selectPageIndex >= 0 && !selectedRects.isEmpty();
        suppressPageTapForGesture =
          PapyrusTextSelectionGesture.shouldSuppressPageTap(hasSelection);

        if (hasSelection) {
          int handleHit = hitTestHandle(event.getX(), event.getY(), density);
          if (handleHit != 0) {
            draggedHandle = handleHit;
            if (velocityTracker != null) {
              velocityTracker.recycle();
              velocityTracker = null;
            }
            return true;
          }
          boolean insideSelection =
            isPointInsideSelection(event.getX(), event.getY(), density);
          if (PapyrusTextSelectionGesture.shouldDismissSelectionOnTouch(
              true, false, insideSelection)) {
            clearSelectionState();
            emitSelectionCleared();
          } else {
            insideSelectionAtDown = insideSelection;
          }
        }

        if (velocityTracker == null) {
          velocityTracker = VelocityTracker.obtain();
        } else {
          velocityTracker.clear();
        }
        velocityTracker.addMovement(event);
        flingScroller.abortAnimation();
        removeCallbacks(flingRunnable);
        lastTouchX = event.getX();
        lastTouchY = event.getY();
        return true;
      }

      case MotionEvent.ACTION_MOVE: {
        if (velocityTracker != null) {
          velocityTracker.addMovement(event);
        }

        float moveDx = event.getX() - touchDownX;
        float moveDy = event.getY() - touchDownY;
        float moveDistance = (float) Math.hypot(moveDx, moveDy);

        if (draggedHandle != 0 && isSelectingText && selectPageIndex >= 0) {
          ensureLayout();
          PageFrame moveFrame = findSelectFrame();
          if (moveFrame != null) {
            float nx = clamp01((event.getX() + offsetX - moveFrame.left) / moveFrame.width);
            float ny = clamp01((event.getY() + offsetY - moveFrame.top) / moveFrame.height);
            if (draggedHandle < 0) {
              selectStartX = nx;
              selectStartY = ny;
            } else {
              selectEndX = nx;
              selectEndY = ny;
            }
            performTextSelection(false);
          }
          lastTouchX = event.getX();
          lastTouchY = event.getY();
          return true;
        }

        if (isSelectingText && selectPageIndex >= 0 && insideSelectionAtDown) {
          if (!PapyrusTextSelectionGesture.shouldStartScrollFromSelection(
              true, moveDistance, TAP_MAX_DISTANCE_DP * density)) {
            lastTouchX = event.getX();
            lastTouchY = event.getY();
            return true;
          }
          clearSelectionState();
          emitSelectionCleared();
          insideSelectionAtDown = false;
        }

        if (!isSelectingText && moveDistance > TAP_MAX_DISTANCE_DP * density) {
          if (!scaleDetector.isInProgress() && event.getPointerCount() == 1) {
            offsetX += lastTouchX - event.getX();
            offsetY += lastTouchY - event.getY();
            clampOffsets();
            emitScrollEvent(offsetY);
            invalidate();
          }
        }
        lastTouchX = event.getX();
        lastTouchY = event.getY();
        return true;
      }

      case MotionEvent.ACTION_UP:
      case MotionEvent.ACTION_CANCEL: {
        boolean wasHandleDrag = draggedHandle != 0;
        draggedHandle = 0;
        insideSelectionAtDown = false;

        if (event.getActionMasked() == MotionEvent.ACTION_CANCEL) {
          suppressPageTapForGesture = false;
          return true;
        }

        if (wasHandleDrag && selectPageIndex >= 0) {
          performTextSelection(true);
          return true;
        }

        if (!scaleDetector.isInProgress() && velocityTracker != null) {
          velocityTracker.addMovement(event);
          velocityTracker.computeCurrentVelocity(1000, 8000);
          float velocityX = velocityTracker.getXVelocity();
          float velocityY = velocityTracker.getYVelocity();
          if (Math.abs(velocityX) > 200 || Math.abs(velocityY) > 200) {
            if ("single".equals(viewMode)) {
              int currentPage = computeVisiblePage() - 1;
              int targetPage = currentPage;
              if (velocityY > 400 && currentPage > 0) {
                targetPage = currentPage - 1;
              } else if (velocityY < -400 && currentPage < pageFrames.size() - 1) {
                targetPage = currentPage + 1;
              }
              snapToPage(targetPage);
            } else {
              flingScroller.fling(
                Math.round(offsetX),
                Math.round(offsetY),
                Math.round(-velocityX),
                Math.round(-velocityY),
                0,
                Math.max(0, Math.round(contentWidth - getWidth())),
                0,
                Math.max(0, Math.round(contentHeight - getHeight()))
              );
              postOnAnimation(flingRunnable);
            }
          } else if ("single".equals(viewMode)) {
            int visiblePage = computeVisiblePage();
            if (visiblePage > 0) {
              snapToPage(visiblePage - 1);
            }
          }
          velocityTracker.recycle();
          velocityTracker = null;
        }

        long duration = System.currentTimeMillis() - touchDownTime;
        float upDx = event.getX() - touchDownX;
        float upDy = event.getY() - touchDownY;
        float upDistance = (float) Math.hypot(upDx, upDy);

        if (duration > TAP_MAX_DURATION_MS || upDistance > TAP_MAX_DISTANCE_DP * density) {
          return true;
        }

        long now = System.currentTimeMillis();
        boolean isDoubleTap = PapyrusTextSelectionGesture.resolveDoubleTap(
          now,
          lastTapTime,
          event.getX() - lastTapX,
          event.getY() - lastTapY,
          doubleTapTimeoutMs,
          DOUBLE_TAP_MAX_DISTANCE_DP * density
        );

        if (pendingSingleTap != null) {
          mainHandler.removeCallbacks(pendingSingleTap);
          pendingSingleTap = null;
        }

        if (PapyrusTextSelectionGesture.shouldEmitPageTap(isDoubleTap)) {
          lastTapTime = now;
          lastTapX = event.getX();
          lastTapY = event.getY();
          final float tapX = event.getX();
          final float tapY = event.getY();
          final boolean allowPageTap = !suppressPageTapForGesture;
          suppressPageTapForGesture = false;
          pendingSingleTap = () -> {
            pendingSingleTap = null;
            ensureLayout();
            float docX = tapX + offsetX;
            float docY = tapY + offsetY;
            int pageIdx = findPageIndexAt(docX, docY);
            if (pageIdx < 0) return;
            PageFrame frame = pageFrames.get(pageIdx);
            float nx = (docX - frame.left) / frame.width;
            float ny = (docY - frame.top) / frame.height;
            Annotation hit = findAnnotationAt(pageIdx, nx, ny);
            if (hit != null) {
              // O tap de anotação continua funcionando mesmo ao desselecionar.
              emitAnnotationTap(hit);
            } else if (allowPageTap) {
              emitTap(pageIdx, clamp01(nx), clamp01(ny));
            }
          };
          mainHandler.postDelayed(pendingSingleTap, doubleTapTimeoutMs + 50);
        } else {
          lastTapTime = 0;
          suppressPageTapForGesture = false;
          beginWordSelection(event.getX(), event.getY());
        }
        return true;
      }

      default:
        return true;
    }
  }
```

Nota: `shouldDismissSelectionOnTouch` é sempre chamado com `hitHandle=false`
(o caso de alça retorna antes); o ramo `hitHandle` existe para deixar a regra
completa e coberta por teste unitário.

- [ ] **Step 4: Compilar**

Run: `cd examples/mobile/android && ./gradlew :papyrus_engine_native:assembleDebug`
Expected: BUILD SUCCESSFUL, sem chamadas sem argumento a `performTextSelection` nem referências a `DOUBLE_TAP_MAX_DELTA_MS` ou `shouldContinueAfterSelectionTouch`.

Antes de compilar, remover de `PapyrusTextSelectionGesture.java` o método
`shouldContinueAfterSelectionTouch` (ficou sem chamadores com o novo
`handleSelectTouch`).

- [ ] **Step 5: Rodar os testes Java**

Run: `cd examples/mobile/android && ./gradlew :papyrus_engine_native:testDebugUnitTest`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 6: Commit**

```bash
git add packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusPdfViewerView.java packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusTextSelectionGesture.java packages/engine-native/android/src/test/java/com/papyrus/engine/PapyrusTextSelectionGestureTest.java
git commit -m "fix(android): select word on double tap and dismiss outside selection"
```

### Task 2.3: Build e smoke no POCO

**Files:**
- Nenhum arquivo do repo (validação em dispositivo).

- [ ] **Step 1: Instalar no POCO**

Run:
```bash
cd examples/mobile/android && ./gradlew :app:assembleDebug
adb -s 6fe88ef10000 install -r app/build/outputs/apk/debug/app-debug.apk
```
Expected: `Success` na instalação.

- [ ] **Step 2: Smoke roteirizado**

Abrir um PDF e executar, verificando cada item com screenshot:

1. Double-tap numa palavra → seleção aparece **com a barra de ações**.
2. Tap fora → seleção some e a folha Páginas **não** abre.
3. Tap dentro → seleção permanece.
4. Arrastar a alça de cima para baixo atravessando linhas → retângulos por linha corretos.
5. Tocar fora e arrastar → rola normalmente, sem travar.
6. Double-tap numa palavra acentuada/hifenizada → palavra inteira selecionada.

Expected: todos os 6 comportamentos; registrar screenshot de cada um em `/tmp/opencode`.

- [ ] **Step 3: Commit (se houver ajuste de código durante o smoke)**

Commitar apenas os arquivos ajustados (nunca `git add -A`, para não arrastar
as alterações locais de ícones/notas/safe area). Exemplo:

```bash
git add packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusPdfViewerView.java
git commit -m "fix(android): tune selection touch handling from device smoke"
```

---

## Chunk 3: PageRenderer (iOS compartilhado) e verificação final

### Task 3.1: Helper de hit-test da UI da seleção (TDD)

**Files:**
- Modify: `packages/ui-react-native/components/selectionContentInteraction.ts`
- Test: `packages/ui-react-native/components/selectionContentInteraction.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

Substituir o import existente de `selectionContentInteraction.test.ts` por:

```ts
import {
  isPointInsideSelectionUi,
  shouldDismissSelectionOnContentInteraction,
} from "./selectionContentInteraction";
```

e o novo bloco de testes:

```ts
describe("selection ui hit testing", () => {
  const rects = [
    { x: 0, y: 0, width: 100, height: 50 },
    { x: 200, y: 0, width: 100, height: 56 },
  ];

  it("accepts a point inside an inflated rect", () => {
    expect(
      isPointInsideSelectionUi({
        point: { x: -8, y: 25 },
        hitRects: rects,
        padding: 12,
      })
    ).toBe(true);
  });

  it("rejects a point outside every inflated rect", () => {
    expect(
      isPointInsideSelectionUi({
        point: { x: 150, y: 25 },
        hitRects: rects,
        padding: 12,
      })
    ).toBe(false);
  });

  it("rejects a point beyond the padding", () => {
    expect(
      isPointInsideSelectionUi({
        point: { x: -12, y: 25 },
        hitRects: rects,
        padding: 12,
      })
    ).toBe(true);
    expect(
      isPointInsideSelectionUi({
        point: { x: -13, y: 25 },
        hitRects: rects,
        padding: 12,
      })
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npx vitest run packages/ui-react-native/components/selectionContentInteraction.test.ts`
Expected: FAIL no link do módulo Vite (`does not provide an export named 'isPointInsideSelectionUi'`) ou `isPointInsideSelectionUi is not a function`.

- [ ] **Step 3: Implementar o helper**

Em `selectionContentInteraction.ts`, adicionar ao final:

```ts
export type SelectionUiRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const isPointInsideSelectionUi = ({
  point,
  hitRects,
  padding,
}: {
  point: { x: number; y: number };
  hitRects: SelectionUiRect[];
  padding: number;
}): boolean =>
  hitRects.some(
    (rect) =>
      point.x >= rect.x - padding &&
      point.x <= rect.x + rect.width + padding &&
      point.y >= rect.y - padding &&
      point.y <= rect.y + rect.height + padding
  );
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run packages/ui-react-native/components/selectionContentInteraction.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui-react-native/components/selectionContentInteraction.ts packages/ui-react-native/components/selectionContentInteraction.test.ts
git commit -m "test(mobile): add selection ui hit testing helper"
```

### Task 3.2: Double-tap passa endpoints e substitui a seleção

**Files:**
- Modify: `packages/ui-react-native/components/PageRenderer.tsx`

- [ ] **Step 1: `selectAtPoint` envia endpoints**

Substituir:

```ts
  const selectAtPoint = async (x: number, y: number) => {
    if (!layout.width || !layout.height) return;
    const size = 26;
    const half = size / 2;
    const left = clamp(x - half, 0, Math.max(0, layout.width - size));
    const top = clamp(y - half, 0, Math.max(0, layout.height - size));
    const bounds = {
      x: left / layout.width,
      y: top / layout.height,
      width: size / layout.width,
      height: size / layout.height,
    };
    await selectFromBounds(bounds);
  };
```

por:

```ts
  const selectAtPoint = async (x: number, y: number) => {
    if (!layout.width || !layout.height) return;
    const size = 26;
    const half = size / 2;
    const left = clamp(x - half, 0, Math.max(0, layout.width - size));
    const top = clamp(y - half, 0, Math.max(0, layout.height - size));
    const bounds = {
      x: left / layout.width,
      y: top / layout.height,
      width: size / layout.width,
      height: size / layout.height,
    };
    const point = {
      x: clamp01(x / layout.width),
      y: clamp01(y / layout.height),
    };
    await selectFromBounds(bounds, { start: point, end: { ...point } });
  };
```

- [ ] **Step 2: `handleDoubleTap` substitui a seleção existente**

Substituir:

```ts
  const handleDoubleTap = useCallback(
    (x: number, y: number) => {
      if (shouldSuppressPressAfterPinch(lastPinchEndedAt)) {
        return;
      }
      if (
        !isNative ||
        activeTool !== "select" ||
        selectionRects.length > 0 ||
        selectionBounds
      ) {
        return;
      }
      void selectAtPoint(x, y);
    },
    [
      activeTool,
      isNative,
      lastPinchEndedAt,
      selectionBounds,
      selectionRects.length,
    ]
  );
```

por:

```ts
  const handleDoubleTap = useCallback(
    (x: number, y: number) => {
      if (shouldSuppressPressAfterPinch(lastPinchEndedAt)) {
        return;
      }
      if (!isNative || activeTool !== "select") {
        return;
      }
      if (selectionRects.length > 0 || selectionBounds) {
        clearSelection();
      }
      void selectAtPoint(x, y);
    },
    [
      activeTool,
      clearSelection,
      isNative,
      lastPinchEndedAt,
      selectionBounds,
      selectionRects.length,
    ]
  );
```

- [ ] **Step 3: Rodar testes e build do pacote**

Run:
```bash
pnpm --filter @papyrus-sdk/ui-react-native build
node --test packages/ui-react-native/gesture/selectionInteraction.test.mjs
```
Expected: build sem erros de tipo e os 9 testes da suíte passando (ela usa `node:test` sobre `dist/`, por isso roda depois do build).

- [ ] **Step 4: Commit**

```bash
git add packages/ui-react-native/components/PageRenderer.tsx
git commit -m "fix(ios): replace selection on double tap with endpoints"
```

### Task 3.3: Tap fora restrito à UI da seleção e preview com throttle

**Files:**
- Modify: `packages/ui-react-native/components/PageRenderer.tsx`

- [ ] **Step 1: Importar o helper**

No bloco de imports de componentes de `PageRenderer.tsx`, adicionar apenas:

```ts
import { isPointInsideSelectionUi } from "./selectionContentInteraction";
```

- [ ] **Step 2: Substituir o cálculo generoso em `handlePress`**

Substituir:

```ts
    if (selectionRects.length > 0 || selectionBounds) {
      const selectionPx =
        selectionBounds && layout.width && layout.height
          ? {
              x: selectionBounds.x * layout.width,
              y: selectionBounds.y * layout.height,
              width: selectionBounds.width * layout.width,
              height: selectionBounds.height * layout.height,
            }
          : null;
      if (selectionPx) {
        const toolbarTop =
          selectionPx.y + selectionPx.height + 8 > layout.height - 56
            ? Math.max(8, selectionPx.y - 52)
            : selectionPx.y + selectionPx.height + 8;
        const withinSelectionUi =
          locationX >= selectionPx.x - 24 &&
          locationX <= selectionPx.x + Math.max(220, selectionPx.width) + 24 &&
          locationY >= Math.min(selectionPx.y, toolbarTop) - 24 &&
          locationY <=
            Math.max(selectionPx.y + selectionPx.height, toolbarTop + 56) + 24;
        if (withinSelectionUi) {
          return;
        }
      }
      clearSelection();
      return;
    }
```

por:

```ts
    if (selectionRects.length > 0 || selectionBounds) {
      const selectionPx =
        selectionBounds && layout.width && layout.height
          ? {
              x: selectionBounds.x * layout.width,
              y: selectionBounds.y * layout.height,
              width: selectionBounds.width * layout.width,
              height: selectionBounds.height * layout.height,
            }
          : null;
      if (selectionPx) {
        const toolbarTop =
          selectionPx.y + selectionPx.height + 8 > layout.height - 56
            ? Math.max(8, selectionPx.y - 52)
            : selectionPx.y + selectionPx.height + 8;
        const hitRects = [
          selectionPx,
          {
            x: selectionPx.x,
            y: toolbarTop,
            width: Math.max(220, selectionPx.width),
            height: 56,
          },
        ];
        if (
          isPointInsideSelectionUi({
            point: { x: locationX, y: locationY },
            hitRects,
            padding: 12,
          })
        ) {
          return;
        }
      }
      clearSelection();
      return;
    }
```

- [ ] **Step 3: Throttle do preview do arrasto**

Adicionar logo após `selectionRequestIdRef` (~linha 417):

```ts
  const selectionPreviewAtRef = useRef(0);
```

Substituir o miolo de `updateSelectionRectFromPoint`:

```ts
      const rect = resolveSelectionDragRect({
        start,
        end: { x, y },
        width: layout.width,
        height: layout.height,
        lineThreshold: Math.max(
          8,
          layout.height * SELECTION_LINE_CROSSING_THRESHOLD_RATIO
        ),
      });
      selectionRectRef.current = rect;
      setSelectionRect(rect);
```

por:

```ts
      const rect = resolveSelectionDragRect({
        start,
        end: { x, y },
        width: layout.width,
        height: layout.height,
        lineThreshold: Math.max(
          8,
          layout.height * SELECTION_LINE_CROSSING_THRESHOLD_RATIO
        ),
      });
      selectionRectRef.current = rect;
      const now = Date.now();
      if (now - selectionPreviewAtRef.current < 32) return;
      selectionPreviewAtRef.current = now;
      setSelectionRect(rect);
```

- [ ] **Step 4: Rodar testes e build do pacote**

Run:
```bash
npx vitest run packages/ui-react-native/components/selectionContentInteraction.test.ts
pnpm --filter @papyrus-sdk/ui-react-native build
node --test packages/ui-react-native/gesture/selectionInteraction.test.mjs
```
Expected: Vitest passa, build sem erros de tipo e a suíte de gesto passa.

- [ ] **Step 5: Commit**

```bash
git add packages/ui-react-native/components/PageRenderer.tsx
git commit -m "fix(ios): restrict selection dismiss to the selection ui"
```

### Task 3.4: Verificação final

**Files:**
- Nenhum arquivo novo (a menos que o smoke revele ajustes).

- [ ] **Step 1: Suíte completa dos afetados**

Run:
```bash
npx vitest run packages/ui-react-native/components
(cd examples/mobile/android && ./gradlew :papyrus_engine_native:testDebugUnitTest)
pnpm --filter @papyrus-sdk/ui-react-native build
node --test packages/ui-react-native/gesture/selectionInteraction.test.mjs
cmake -S packages/engine-native/android/src/main/cpp -B tmp/papyrus-selection-tests -DPAPYRUS_CPP_HOST_TESTS=ON && cmake --build tmp/papyrus-selection-tests && ctest --test-dir tmp/papyrus-selection-tests --output-on-failure
```
Expected: todos passando.

- [ ] **Step 2: `git diff --check` e revisão do diff**

Run: `git diff --check && git status --short`
Expected: sem erros de whitespace; apenas os arquivos deste plano modificados, preservando as alterações locais pré-existentes de ícones/notas.

- [ ] **Step 3: Repetir o smoke da Task 2.3 com o build final**

Os caminhos Android usam o viewer nativo; o iOS não tem simulador neste Linux.
Expected: os mesmos 6 comportamentos da Task 2.3, com screenshots em
`/tmp/opencode`; registrar no resumo final que o iOS foi coberto por testes
compartilhados + revisão do bridge.

- [ ] **Step 4: Commit final (se necessário)**

Se nada mudou, não há commit nesta etapa. Se o smoke exigiu ajustes, commitar
apenas os arquivos ajustados (mesmo padrão da Task 2.3, Step 3), nunca
`git add -A`, com a mensagem:

```
chore(mobile): finalize selection interaction verification
```

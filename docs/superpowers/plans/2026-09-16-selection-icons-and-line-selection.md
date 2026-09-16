# Plano: seleção por linhas, ícones Lucide e aspas nas notas

## Goal

Fazer a seleção móvel respeitar o início e o fim de cada linha ao arrastar ou
mover alças, aplicar os paths Lucide pedidos nas barras de ação e apresentar
as notas como `[Quote invertido] ... texto... [Quote normal]`, sem alterar o
conteúdo salvo.

## Architecture

O contrato `DocumentEngine.selectText` preservará o retângulo normalizado
existente e ganhará pontos opcionais `start`/`end`. O `PageRenderer` e o
`DedicatedAndroidPdfViewer` enviarão esses pontos. O Android PDFium agrupará
as caixas reais dos glifos em linhas, selecionará por intervalo direcional e
devolverá retângulos por linha em ordem de leitura. O iOS receberá o mesmo
contrato no bridge e manterá o fallback legado quando os pontos não forem
enviados. O bounding box continuará sendo usado apenas para a moldura e
compatibilidade, nunca como regra final da seleção nativa.

## Tech Stack

TypeScript, React Native, React Native SVG, Java/Kotlin, JNI/C++ PDFium,
Objective-C PDFKit, Jest-free Node tests, Gradle unit tests.

## Skills

@test-driven-development
@verification-before-completion
@react-native-scrcpy-control

## Tarefas

### 1. Fechar o contrato e a seleção por linhas (TDD)

- Escrever primeiro testes para pontos na mesma linha, descida, subida,
  alças e seleção de texto sem caracteres fora do primeiro/último segmento.
- Adicionar o tipo de pontos normalizados e o parâmetro opcional em
  `packages/types/index.ts`, `packages/core/engine.ts` e todos os adapters.
- Encaminhar os pontos pelo módulo nativo Android/iOS e pelo bridge remoto,
  preservando chamadas antigas sem endpoints.
- Alterar o PDFium para agrupar glifos por sobreposição vertical/caixas reais e
  selecionar o primeiro, intermediário e último segmento conforme a direção.
- Fazer o `PageRenderer` manter os endpoints do gesto e das alças; deixar o
  helper visual responsável somente pela prévia e pelo bounding box.

Arquivos principais:

- `packages/types/index.ts`
- `packages/core/engine.ts`
- `packages/engine-native/index.ts`
- `packages/engine-native/android/src/main/cpp/papyrus_text_search.cpp`
- `packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusTextSelect.java`
- `packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusNativeEngineModule.java`
- `packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusNativeEngineModule.kt`
- `packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusPdfViewerView.java`
- `packages/engine-native/ios/PapyrusNativeEngine.m`
- `packages/ui-react-native/components/PageRenderer.tsx`

Verificar com testes puros, `PapyrusTextSelectionGestureTest` e build dos
bridges nativos. Fazer um commit focado após a etapa passar.

### 2. Atualizar os ícones e a barra de seleção (TDD)

- Escrever testes de estrutura para `PencilLine`, `Copy`, `Underline`,
  `MessageSquareQuote` e `Quote`.
- Substituir as geometrias customizadas correspondentes em
  `packages/ui-react-native/icons.tsx` pelos paths Lucide fornecidos,
  mantendo tamanho, cor, espessura e acessibilidade.
- Aplicar os quatro ícones às ações equivalentes em
  `DedicatedAndroidPdfViewer.tsx` e `PageRenderer.tsx`, sem remover ações
  existentes sem uma correspondência explícita.

Fazer um commit focado após os testes do catálogo e o build do pacote.

### 3. Compor as aspas na aba de notas (TDD)

- Adicionar teste para confirmar abertura espelhada, reticências após a aspa
  inicial e antes da aspa final, inclusive com conteúdo multiline e vazio.
- Em `RightSheet.tsx`, compor ícone inicial, texto com `...` e ícone final;
  marcar os ícones como decorativos e preservar `ann.content` exatamente.
- Validar que highlights, underlines e comentários continuam listados sem
  mutar o conteúdo armazenado.

Fazer um commit focado após a validação da composição.

### 4. Verificação final

- Rodar testes puros de seleção e ícones, build React Native e testes Android.
- Rodar `git diff --check` e revisar o diff apenas dos arquivos desta tarefa.
- Tentar smoke test no emulador Android nos fluxos `PageRenderer` e
  `DedicatedAndroidPdfViewer`; registrar claramente se o ADB estiver bloqueado.
- Confirmar que as alterações locais pré-existentes de safe area, `topScroll`
  e `zIndex` não foram modificadas.

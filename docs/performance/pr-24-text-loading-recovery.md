# PR24 — TXT loading recovery

## Escopo

Esta rodada cobre o contrato de carregamento de TXT no Android e smokes básicos
do runtime WebView. A validação foi feita exclusivamente no `emulator-5554`.
Pinch, distant jump, rotação, jank de PDF grande, viewer nativo dedicado, iOS,
web e stress profundo de memória permanecem fora do escopo.

## Baseline

- Base: `origin/main` em `1bde57e236db58b5dddc44fa7f3b71554f0e3cc6` (pós-PR23).
- O stall histórico de TXT não foi reproduzido com a amostra inline mínima do
  example: após tocar em `TEXT`, o conteúdo apareceu no `emulator-5554`.
- A amostra, porém, exibia `\\n` literal porque o texto era definido com duas
  barras no `App.tsx`.
- A inspeção do fluxo confirmou uma falha real independente da reprodução: o
  `catch` de `loadDocument()` apenas registrava o erro. Em caso de rejeição,
  `isLoaded` permanecia `false` e o overlay continuava mostrando o spinner para
  sempre. Também não havia geração no app para impedir que uma carga antiga
  publicasse depois de uma nova.

## Correção

- Adicionada uma máquina pequena e testável de geração/terminal em
  `examples/mobile-expo/perf/documentLoadState.ts`.
- O example agora associa cada load a uma geração e aceita somente o terminal
  da carga atual.
- Falhas de load deixam de ser engolidas: o spinner é substituído por uma
  mensagem de erro para a carga atual.
- O runtime WebView compartilha a geração entre formatos e verifica a geração
  de TXT antes de limpar/renderizar o conteúdo. Cargas TXT superseded emitem
  `document.stale`; erros emitem `document.error`.
- A ponte do WebView agora é invalidada no unmount e não reutiliza o estado
  `ready` de uma instância anterior. Isso evita que uma troca PDF → TXT envie a
  carga para uma referência de WebView já destruída.
- A amostra TXT usa quebras de linha reais.
- Foram adicionados fixtures determinísticos `small`, `multiline`, `unicode`,
  `large` e `empty` para os testes do harness.

## Evidência Android

APK release gerado e instalado no `emulator-5554`.

Fluxo executado:

```text
cold launch
→ tocar TEXT
→ aguardar 5 s
```

Resultado: conteúdo TXT visível, com quebra entre os parágrafos, sem spinner
preso, crash ou redbox. A execução não utilizou dispositivo físico nem POCO.

Também foram feitos 10 acionamentos consecutivos do botão `TEXT` no mesmo
APK/emulador. Ao final da sequência o conteúdo permanecia visível e não houve
erro do app no logcat; não foram coletadas capturas individuais de cada ciclo.

Após a correção do lifecycle da ponte, foram executados no APK release:

- `TXT → PDF → TXT`: PDF e TXT finais visíveis;
- `TXT → EPUB → TXT`: EPUB e TXT finais visíveis;
- sem spinner preso nos dois fluxos.

## Testes e builds

- Testes focados: **32/32** passando (coordinator, fixtures, fixture startup,
  runtime comic/EPUB regression, runtime real de document load e lifecycle da
  ponte WebView).
- `@papyrus-sdk/ui-react-native build`: passou.
- `node --check packages/ui-react-native/runtime/runtime.js`: passou.
- `git diff --check`: passou.
- Release Android APK: passou.
- O teste de runtime executa o WebView com `fetch` controlado e cobre: TXT
  vazio concluído, fonte inválida terminando em erro e TXT pendente marcado
  como stale quando uma nova carga começa.
- O teste do engine cobre a troca de WebView: a ponte antiga não é reutilizada
  como pronta e a carga aguarda a nova instância.

O conjunto completo ainda possui falhas preexistentes do ambiente do
worktree: alguns testes tentam spawnar o Node e recebem `EPERM`, e os testes do
example web apresentam incompatibilidade React/renderer. Esses testes não
foram alterados pela PR24.

## Fixtures e limitações

O example mobile-expo não possui fixture CBR/CBZ versionada; CBR também é uma
extensão opcional (`@papyrus-sdk/engine-cbr-mobile`). Portanto, o smoke
CBR/CBZ real fica pendente de fixture/runtime habilitado, sem inventar uma
validação que não foi executada. EPUB/PDF continuam cobertos pela suíte e pelo
smoke de build. CBR/CBZ continuam pendentes porque não há fixture versionada
nem runtime habilitado no example. A troca rápida sem aguardar a carga não é
um cenário válido neste harness, pois o overlay de loading intercepta os
botões; as trocas sequenciais aguardadas de PDF e EPUB foram executadas.

## Status

Esta PR corrige o caminho comprovadamente defeituoso de terminal de erro e a
proteção contra loads obsoletos, além de deixar a amostra TXT funcional e
testável. A reprodução do spinner infinito original não foi obtida nesta
rodada; a confirmação visual disponível é a do TXT mínimo no APK release.

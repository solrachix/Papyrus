# EPUB Loading no Android Debug/Release

## Objetivo

Fazer o carregamento de EPUB no Android chegar a `ready` e exibir conteúdo
scrollável em debug e release, mantendo a correção isolada do stall de
reverse-scroll da PR16.

## Diagnóstico esperado

O runtime possui dois caminhos de conversão para EPUB. `sourceToArrayBuffer`
já produz um `ArrayBuffer`, mas o caminho de carregamento base64 ainda pode
passar um `Uint8Array` diretamente para `ePub(data)`. A PR19 vai confirmar o
tipo, tamanho e etapa que falha antes de escolher a menor correção.

## Desenho

- adicionar um helper que produza um `ArrayBuffer` exato para qualquer
  `Uint8Array`, respeitando `byteOffset` e `byteLength`;
- usar o formato binário único no carregamento EPUB por base64 e URI;
- adicionar eventos de diagnóstico opt-in para source, `book.ready`, spine,
  rendition, display e terminais de sucesso/erro;
- capturar `window.error`, `unhandledrejection` e rejeições do book/display sem
  engolir falhas;
- manter timeout somente como diagnóstico, nunca como mecanismo para declarar
  o documento pronto;
- sincronizar `runtime.js` e `index.html` pelo gerador oficial do projeto.

## Estado e terminais

O carregamento deve terminar em exatamente um estado final: `ready` após
`book.ready` e `rendition.display`, ou `error` quando uma etapa falhar. O
timeout apenas emite evidência diagnóstica e não substitui uma resolução ou
rejeição real.

## Testes e validação

- teste unitário do helper com buffer completo e `Uint8Array` deslocado;
- teste do runtime garantindo `ArrayBuffer` no `ePub` e equivalência dos dois
  artefatos gerados;
- testes de sucesso e falha do pipeline sem loading infinito;
- build/testes do pacote;
- debug via Metro e release APK exclusivamente no `emulator-5554` (API 35),
  com EPUB pequeno e longo, conteúdo visível e scroll para baixo/cima;
- smoke test de PDF após a alteração.

## Fora do escopo

Reverse-scroll, `ContinuousManager.check`, detector de stall, pinch/zoom,
renderização PDF, distant jump, orientação, UI e otimização geral de EPUB.

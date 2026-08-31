# EPUB Loading no Android Debug/Release

## Objetivo

Fazer o carregamento de EPUB no Android chegar a `ready` e exibir conteúdo
scrollável em debug e release, mantendo a correção isolada do stall de
reverse-scroll da PR16.

## Diagnóstico esperado

O runtime possui dois caminhos de conversão para EPUB. `sourceToArrayBuffer`
já produz um `ArrayBuffer`, mas o caminho de carregamento base64 ainda pode
passar um `Uint8Array` diretamente para `ePub(data)`. A PR19 vai confirmar o
tipo, tamanho e etapa que falha antes de escolher a menor correção. O caminho
`text` continuará textual quando aplicável; `base64` e `uri` serão binários
`ArrayBuffer` com o mesmo contrato.

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

## Contrato de diagnóstico

Cada evento terá `{ type, loadId, timestamp, sourceKind, byteLength,
currentType, durationMs, error }`, omitindo campos sem valor. Os nomes serão
`epub.load.start`, `epub.source.received`, `epub.source.decoded`,
`epub.book.created`, `epub.book.ready.start`, `epub.book.ready.end`,
`epub.spine.ready`, `epub.rendition.created`, `epub.display.start`,
`epub.display.end`, `epub.load.ready`, `epub.load.error` e
`epub.load.timeout`. O diagnóstico só será emitido quando a flag opt-in já
usada pelo runtime estiver ativa.

O bridge entregará `document.ready` e `document.error` associados ao mesmo
`loadId`; `document.error` conterá mensagem e stack serializáveis e rejeitará o
load pendente. Um consumidor não deve marcar `ready` por evento de diagnóstico:
isso só ocorre depois de `book.ready` e `rendition.display`.

## Estado e terminais

O carregamento deve terminar em exatamente um estado final: `ready` após
`book.ready` e `rendition.display`, ou `error` quando uma etapa falhar. O
load receberá um `loadId` monotônico. Um callback de geração anterior não pode
alterar o estado ou emitir `document.ready` da geração atual. A implementação
deve invalidar a geração anterior quando um novo load começa.

O timeout de diagnóstico será de 10 segundos por etapa pendente. Se
`book.ready` ou `rendition.display` não resolverem nem rejeitarem dentro desse
limite, o runtime emitirá `epub.load.timeout` e terminará o load com
`document.error`/estado `error`; nunca continuará silenciosamente em
`loading` e nunca declarará `ready` por timeout. Callbacks atrasados serão
ignorados pelo `loadId`.

## Artefatos do runtime

O arquivo fonte do runtime é `packages/ui-react-native/runtime/runtime.js`.
Após alterá-lo, executar:

```bash
pnpm --filter @papyrus-sdk/ui-react-native exec node runtime/syncRuntime.mjs
```

Se o script existente tiver outro nome, a implementação deve localizar e usar
o script oficial equivalente, documentando o comando efetivo. O teste deve
comparar o trecho funcional relevante em `runtime.js` e `index.html`, incluindo
a conversão `sourceToArrayBuffer` e o caminho `ePub(data)`.

## Testes e validação

- teste unitário do helper com buffer completo e `Uint8Array` deslocado;
- teste do runtime garantindo `ArrayBuffer` no `ePub` para `base64` e `uri`,
  preservando `text` quando aplicável, e equivalência dos dois artefatos
  gerados;
- testes de sucesso, rejeição, timeout e load concorrente, garantindo um único
  terminal por `loadId` e sem loading infinito;
- build/testes do pacote;
- debug via Metro na porta livre e release APK exclusivamente no
  `emulator-5554` (API 35), com EPUB pequeno e longo, conteúdo visível e
  scroll para baixo/cima;
- registrar fixture, comando, timestamp, `loadId`, eventos finais e evidência
  visual de conteúdo/scroll;
- smoke test de PDF: abrir a fixture PDF padrão, aguardar `document.ready` e
  confirmar página renderizada após a troca de documento.

## Fora do escopo

Reverse-scroll, `ContinuousManager.check`, detector de stall, pinch/zoom,
renderização PDF, distant jump, orientação, UI e otimização geral de EPUB.

# @papyrus-sdk/engine-cbr

Engine opcional para leitura de arquivos CBR (RAR4/RAR5) no navegador.

```ts
import workerUrl from "libarchive.js/dist/worker-bundle.js?url";
import { CBREngine } from "@papyrus-sdk/engine-cbr";

const engine = new CBREngine({
  maxCachedPages: 12,
  workerUrl,
});
await engine.load({ type: "comic", source: file });
```

O pacote carrega `libarchive.js` somente quando esta engine é instalada e usada.
`maxCachedPages` limita as páginas principais extraídas mantidas em memória; o
padrão é `12`. As miniaturas usam um cache separado de no máximo quatro páginas.
Em aplicações com bundler, `workerUrl` deve apontar para o `worker-bundle.js`
publicado pela aplicação. Sem essa opção, o libarchive.js usa o worker relativo
ao próprio pacote quando o bundler mantiver esse caminho disponível.

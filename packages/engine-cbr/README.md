# @papyrus-sdk/engine-cbr

Engine opcional para leitura de arquivos CBR (RAR4/RAR5) no navegador.

```ts
import { CBREngine } from "@papyrus-sdk/engine-cbr";

const engine = new CBREngine({ maxCachedPages: 12 });
await engine.load({ type: "comic", source: file });
```

O pacote carrega `libarchive.js` somente quando esta engine é instalada e usada.
`maxCachedPages` limita as imagens extraídas mantidas em memória; o padrão é `12`.

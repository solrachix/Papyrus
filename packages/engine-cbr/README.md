# @papyrus-sdk/engine-cbr

Engine opcional para leitura de arquivos CBR (RAR4/RAR5) no navegador.

```ts
import { CBREngine } from "@papyrus-sdk/engine-cbr";

const engine = new CBREngine({ maxCachedPages: 12 });
await engine.load({ type: "comic", source: file });
```

O pacote carrega `libarchive.js` somente quando esta engine é instalada e usada.
`maxCachedPages` limita as imagens extraídas mantidas em memória; o padrão é `12`.

## Estado da engine Rust

CBR ainda não possui uma implementação Rust integrada. Como CBR usa RAR4/RAR5,
uma migração precisa de um backend compatível com RAR e de um benchmark próprio
de abertura, extração, memória, tamanho do WASM e compatibilidade com arquivos
reais. O caminho atual continua sendo `libarchive.js`.

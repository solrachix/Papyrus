# Papyrus Engine CBZ

Web engine for comic book ZIP archives (`.cbz`). Pages are loaded lazily from
the archive and rendered as images.

## Install

```bash
npm install @papyrus-sdk/engine-cbz @papyrus-sdk/core @papyrus-sdk/types
```

## Usage

```ts
import { CBZEngine } from "@papyrus-sdk/engine-cbz";

const engine = new CBZEngine({ maxCachedPages: 12 });
await engine.load({ type: "comic", source: { uri: "https://example.com/book.cbz" } });
```

`maxCachedPages` limits the number of extracted page images kept in memory.
The default is `12`.

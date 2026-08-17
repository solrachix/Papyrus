# Papyrus CBR Mobile Runtime

Assets opcionais para habilitar CBR no `MobileDocumentEngine` sem adicionar o
worker/WASM do libarchive ao pacote base de UI React Native. O HTML/runtime
continua vindo de `@papyrus-sdk/ui-react-native`; este pacote não o duplica.

Os arquivos em `runtime/` devem ser resolvidos como assets React Native e
passados na configuração da engine:

```tsx
import { Image } from "react-native";
import { MobileDocumentEngine } from "@papyrus-sdk/engine-native";

const client = require("@papyrus-sdk/engine-cbr-mobile/runtime/libarchive.js.txt");
const worker = require("@papyrus-sdk/engine-cbr-mobile/runtime/worker-bundle.js.txt");
const wasm = require("@papyrus-sdk/engine-cbr-mobile/runtime/libarchive.wasm");

const assetUri = (asset: unknown) =>
  typeof asset === "number" ? Image.resolveAssetSource(asset).uri : asset.uri;

const engine = new MobileDocumentEngine({
  webViewRuntimeConfig: {
    cbrClientUrl: assetUri(client),
    cbrWorkerUrl: assetUri(worker),
    cbrWasmUrl: assetUri(wasm),
  },
});
```

Depois, carregue o arquivo com `{ type: "comic", source: { uri } }`.

## Plataforma e validação

O runtime CBR usa `import()` de um módulo ESM em `blob:` e um `Worker` para o
libarchive. O fluxo está preparado para Android WebView, mas CBR mobile ainda
é experimental: esta implementação não foi validada em um dispositivo Android
ou iOS nesta versão. Antes de publicar para produção, valide o picker e o
acesso a `content://`/`file://` em cada plataforma; se o sandbox do WebView
impedir a leitura, o app deverá copiar o arquivo para uma área acessível ou
entregar os bytes pelo lado nativo.

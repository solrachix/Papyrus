# PR 14 — Android pinch zoom

## Escopo

Esta rodada move o preview visual do pinch do caminho JS para `react-native-reanimated`/`SharedValue`. O store, `engine.setZoom` e o render final continuam sendo acionados somente no encerramento do gesto.

## Evidência local

- Suíte: `50` arquivos, `168` testes passando.
- Build do pacote `@papyrus-sdk/ui-react-native`: passou.
- Teste de contrato do Viewer: passou.
- Teste da geometria de pinch: passou.
- Lint do Viewer e do teste: passou.
- Emulador iniciado: `Pixel7Clean`, Android API 35.

## Validação Android

O APK não pôde ser reconstruído nesta máquina. O Gradle reconhece e configura o Reanimated, mas o build falha antes do app ser empacotado no módulo preexistente `expo-dev-launcher@5.0.35`:

```text
DevLauncherDevSupportManagerFactory.kt:46:3 'create' overrides nothing
```

Esse erro ocorre na combinação atual do exemplo Expo/RN 0.76 e não em arquivos alterados pela PR 14. Portanto os números de jank antes/depois devem ser coletados após corrigir essa dependência do ambiente.

## Mudanças observáveis esperadas

- Atualizações de escala e foco durante `onUpdate` ficam na UI thread.
- Não há escrita no store, `engine.setZoom`, `renderPage` ou `renderTextLayer` por frame.
- O commit final continua único e o preview só é removido quando a página âncora sinaliza `onRenderReady`.
- O callback de render-ready está conectado aos modos single, contínuo e dupla página.

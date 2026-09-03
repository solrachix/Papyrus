# PR28 — baseline de memória e lifecycle

## Ambiente

- base: `main` em `c6d7ddcae271f3818ba984ee2c4799259889744b`;
- APK release da mesma base da PR27;
- package: `com.papyrus.sdk.mobileexpo`;
- dispositivo exclusivo: `emulator-5554`, Pixel 7/API 35, `x86_64`;
- viewer: Android `compat`;
- aparelho físico `6fe88ef10000` não foi usado.

## Protocolo

Cold start do APK release com o fixture `small`, aguardando o carregamento
visual e a montagem da página inicial. Depois de 8 segundos em idle, foram
coletados `dumpsys meminfo`, screenshot e UI hierarchy. Esta é uma leitura
inicial, antes do stress e sem `System.gc()`, limpeza de cache ou outra
intervenção artificial.

## Checkpoint inicial

| Recurso | Valor |
| --- | ---: |
| Total PSS | 89.947 KB |
| Native Heap | 25.940 KB |
| Dalvik/Java Heap | 11.408 KB |
| Graphics | 0 KB reportado |
| Views | 75 |
| ViewRootImpl | 1 |
| Activities | 1 |
| WebViews | 0 |

O `small` ficou visualmente aberto com uma `PapyrusPageView` montada e os
controles do reader presentes. O processo não foi reiniciado durante a coleta.

## Limitações

Este checkpoint não separa alocação de aquecimento de retenção e não prova
ausência de leak. O runner da PR28 deverá repetir os mesmos campos nos
checkpoints 0/1/5/10/20 e comparar tendência, pico e valor final por cenário.

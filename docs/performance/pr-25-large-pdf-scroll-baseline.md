# PR25 — baseline de scroll de PDF grande no Android

## Escopo e ambiente

Esta captura cobre apenas o caminho Android `viewerMode="compat"` com
`FlatList`, usando o APK release da PR25 e a instrumentação opt-in. O
dispositivo usado foi exclusivamente o `emulator-5554` (`sdk_gphone64_x86_64`,
Android 15/API 35). O dispositivo físico não fez parte da coleta.

O APK foi construído no worktree isolado da PR25. Como o monorepo resolve
Metro 0.83 por hoisting enquanto o Expo/RN 0.76 do exemplo usa Metro 0.81,
foi usado um override somente em `node_modules` do worktree para permitir o
build; nenhum pin foi adicionado ao repositório.

## Protocolo

Para cada fixture: cold start, `perf=1`, `viewerMode=compat`, espera por
`fixture.loaded` e pelos renders iniciais, reset de `gfxinfo`, quatro swipes
verticais de 600 ms e captura imediata de `gfxinfo`, `meminfo` e logcat.

O protocolo reproduzível está em
[`scripts/benchmarks/android-scroll-profile.sh`](../../scripts/benchmarks/android-scroll-profile.sh).

## Captura inicial

Os valores abaixo são as medianas de três execuções por fixture. Os intervalos
entre parênteses mostram o mínimo e o máximo observados; continuam sendo um
baseline de investigação, não uma estimativa de produção.

| Fixture | Frames | Janky % | P50 | P90 | P95 | P99 | Missed vsync | Slow UI | Slow draw | Attached views | Total PSS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `small` | 0 | n/a | n/a | n/a | n/a | n/a | 0 | 0 | 0 | 75 | 92952 KB (92610–94899) |
| `large-100` | 175 (172–178) | 39.43% (37.64–41.86) | 42 ms | 48 ms | 48 ms (48–53) | 53 ms (48–57) | 22 (21–24) | 32 (28–36) | 69 (67–72) | 94 | 159641 KB (159577–159753) |
| `large-1000` | 172 (169–172) | 40.12% (38.37–41.42) | 42 ms (42–44) | 48 ms | 48 ms (48–53) | 53 ms (48–65) | 19 (17–25) | 29 (28–30) | 69 (66–70) | 94 | 161556 KB (159390–161640) |
| `varied-sizes` | 145 (142–145) | 53.10% (51.03–55.63) | 48 ms | 61 ms | 61 ms | 85 ms (61–85) | 52 (51–57) | 22 (21–28) | 77 (74–79) | 49 | 108575 KB (106776–108954) |

`small` tem uma única página e não produziu uma sessão de scroll real; por
isso não há frames úteis nessa janela.

## Evidência causal auxiliar

Nos fixtures longos, o caminho instrumentado registrou, respectivamente:

| Fixture | Scrolls | Eventos de scroll | Renders | Montagens de surface | Render máximo |
| --- | ---: | ---: | ---: | ---: | ---: |
| `large-100` | 5 por execução | 13 por execução | 13 por execução | 13 por execução | 183 ms |
| `large-1000` | 5 por execução | 13 por execução | 13 por execução | 13 por execução | 605 ms |
| `varied-sizes` | 1 por execução | 7 por execução | 4 por execução | 4 por execução | 166 ms |

Não houve `render.stale`, `render.abandoned` ou `render.error` nessas
capturas. Também não houve crescimento de uma janela de render proporcional
à distância: o `large-1000` montou 13 surfaces ao longo do protocolo e
terminou com 94 views anexadas.

O `gfxinfo` aponta `Slow issue draw commands` como o contador que acompanha
os frames janky em todas as execuções longas. `Slow bitmap uploads` ficou em
zero no `large-1000` e no `varied-sizes`, com apenas uma ocorrência isolada no
`large-100`. Os tempos de render apresentam picos de até 183 ms no
`large-100`, 605 ms em uma execução do `large-1000` e 166 ms no
`varied-sizes`, sobretudo quando uma nova página entra na janela.

## Conclusão do baseline

O primeiro gargalo observável é o custo de desenho/composição associado à
entrada de novas surfaces durante o scroll, com rasterizações individuais
ocasionalmente longas. A instrumentação não demonstrou backlog/stale work nem
renderização O(distância); também não permite separar, sozinha, rasterização
nativa de traversal/draw.

Por isso esta etapa **não aplica ainda uma alteração de comportamento** em
`windowSize`, `maxToRenderPerBatch`, overscan ou scheduler. O próximo passo
deve ser uma comparação controlada que isole o custo de adicionar uma nova
surface durante o gesto; só uma diferença consistente justificará alterar o
agendamento.

## Limitações

- São três execuções por fixture; os percentis publicados são do `gfxinfo` de
  cada janela, não percentis estatísticos de muitas sessões.
- `gfxinfo` mede a janela após o lote inicial, mas ainda inclui o ciclo de
  quatro swipes e seus renders incrementais, não uma sessão perfeitamente
  isolada por página.
- O fixture é sintético e text-only, exceto pelas dimensões variadas.
- O número de views anexadas é uma fotografia ao final da janela, não um pico.

## Controle de overhead

No `large-1000`, três execuções com `perf=0` e três com `perf=1` usaram o mesmo
APK, emulador, reset de `gfxinfo` e quatro swipes. As medianas foram:

| Configuração | Janky % | P90 | P95 | Missed vsync | Slow draw |
| --- | ---: | ---: | ---: | ---: | ---: |
| `perf=0` | 35.88% | 48 ms | 48 ms | 17 | 61 |
| `perf=1` | 37.72% | 48 ms | 48 ms | 19 | 62 |

O resultado é compatível com overhead praticamente neutro para o perfil; a
instrumentação continua opt-in e não há evidência de que ela explique o
jank observado.

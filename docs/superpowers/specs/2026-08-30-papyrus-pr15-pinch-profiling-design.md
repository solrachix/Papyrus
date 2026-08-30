# Papyrus PR 15 — Fixture Harness e Instrumentação do Pinch

## Contexto

As medições Android da PR 14 mostraram que mover o preview do pinch para
Reanimated/UI thread não produziu melhora no fluxo real. A próxima rodada deve
identificar o custo dominante antes de propor outra otimização.

O exemplo Expo hoje carrega um PDF fixo. A instrumentação existente registra
eventos de pinch e renderização, mas não correlaciona uma sessão completa com o
commit documental, a geração de render e o momento em que o preview é removido.
Também não há fixtures móveis selecionáveis para comparar documentos pequenos,
grandes e com dimensões variadas.

## Objetivo

Criar uma infraestrutura opt-in e reproduzível para:

1. selecionar uma fixture por deep link, controlável por ADB;
2. registrar a identidade da fixture carregada;
3. correlacionar cada sessão de pinch com commit, render e preview;
4. separar no relatório a duração do gesto, do commit e do render-to-ready;
5. manter a coleta fora do caminho normal quando a instrumentação estiver
   desativada.

## Fora de escopo

- nenhuma alteração no algoritmo de pinch, transform, focal point, pan ou
  estratégia de renderização;
- nenhuma adoção ou remoção de Reanimated;
- nenhuma otimização baseada nos resultados desta rodada;
- nenhum seletor visual dentro do Viewer ou da tela do exemplo;
- nenhuma alegação de melhora de FPS sem uma rodada posterior de medição.

## Abordagem escolhida

### Seleção de fixture

O App resolverá `fixture` a partir da URL inicial recebida por
`Linking.getInitialURL()`. O valor será validado por uma allowlist e cairá na
fixture padrão quando ausente ou inválido.

Os nomes públicos serão:

- `small` — PDF mínimo para smoke test;
- `large-100` — PDF determinístico com 100 páginas;
- `large-1000` — PDF determinístico com 1000 páginas;
- `varied-sizes` — PDF determinístico com páginas de dimensões diferentes.

A resolução será uma função pura, separada da inicialização do engine, para ser
testada sem React Native. As fontes serão referências estáticas empacotáveis ou
URLs locais de fixture definidas pelo exemplo; o Viewer continuará recebendo
somente o engine.

Exemplo de execução:

```bash
adb shell am force-stop com.papyrus.sdk.mobileexpo
adb shell am start -W -a android.intent.action.VIEW \
  -d 'exp+papyrus-sdk://reader?fixture=large-1000' \
  com.papyrus.sdk.mobileexpo
```

O marcador de carregamento da fixture será emitido antes de `engine.load`, e a
medição de interação só será considerada válida depois que o documento estiver
pronto.

### Instrumentação correlacionada

Cada pinch receberá um `gestureId` monotônico. Os eventos estruturados
compartilharão timestamp monotônico e, quando aplicável, o ID da fixture:

```text
pinch.start
pinch.update        (amostrado; não gerar log por frame)
pinch.end
pinch.commit.start
pinch.commit.end
render.request      (pageIndex, zoom, generation, gestureId)
render.ready        (pageIndex, zoom, generation, gestureId)
render.stale        (pageIndex, generation, gestureId)
pinch.preview.cleared
```

O `PageRenderer` manterá a semântica atual de geração/stale. O novo evento
`render.stale` não será usado para afirmar cancelamento nativo; ele significa
apenas que o resultado não foi promovido porque a geração deixou de ser atual.

O evento `pinch.preview.cleared` será emitido somente quando o handshake aceitar
na página âncora e no zoom comprometido. Sessões órfãs serão fechadas antes de
uma nova sessão, preservando a regra já usada pelo benchmark.

### Coleta Android

O script de benchmark receberá a fixture como argumento e abrirá o deep link
correspondente. Para cada sessão, ele delimitará a coleta de logs estruturados
e a janela de `dumpsys gfxinfo`, sem confundir a injeção ADB com um evento de
pinch do app.

O relatório deverá preservar amostras individuais e agregados. Cada amostra
conterá, quando disponível:

- fixture e dispositivo/API;
- duração do gesto e FPS da janela;
- duração do commit;
- duração de render request até render-ready;
- vida útil do preview;
- frames, janky frames, percentis de frame e missed vsync;
- renders ativos, stale e abandonados.

Se uma etapa não produzir evento de fechamento, a amostra será marcada como
incompleta, não convertida em latência zero.

## Testes

- teste unitário do resolvedor: valores válidos, ausente e inválido;
- teste do parser de deep link sem depender de `Linking` real;
- teste de correlação: uma sessão gera um único commit e associa somente seus
  próprios eventos;
- teste de sessão órfã: iniciar novo pinch fecha a sessão anterior;
- teste de render stale: não conta como `render.ready` nem como cancelamento
  confirmado;
- teste do benchmark: fixture informada aparece no deep link e no relatório;
- suíte existente do pacote e teste de bundle/Android quando o ambiente estiver
  disponível.

## Critério de aceitação

A PR será considerada concluída quando for possível executar, via ADB, pelo
menos `small`, `large-100` e `large-1000`, obter um relatório com amostras
pareadas e distinguir numericamente:

```text
gesto → commit → render request → render-ready → preview cleared
```

`varied-sizes` poderá ser incluída na mesma rodada se a fixture determinística
couber no pacote do exemplo sem tornar o APK impraticável. Caso contrário, o
resolvedor e o contrato ficam preparados para adicioná-la posteriormente.

O resultado desta PR é observabilidade reproduzível. A escolha da otimização
seguinte será feita somente após os números e a validação visual do fluxo.

# PR 16 — EPUB continuous scroll stall / reverse scroll

## Objetivo

Corrigir o stall intermitente ao inverter rapidamente o scroll de um EPUB contínuo no mobile, preservando momentum, seleção, links, chrome, navegação e os caminhos PDF/outros formatos.

## Contexto confirmado

- O mobile usa `WebViewDocumentEngine` e `packages/ui-react-native/runtime/runtime.js`.
- O EPUB é criado com `epub.js` em `manager: 'continuous'` e `flow: 'scrolled-continuous'`.
- A posição é controlada pelo manager/DOM do WebView; o RN recebe apenas eventos `VIEWER_SCROLL`.
- O runtime tem eventos de `relocated`, `selected`, `touchstart` e `touchend`, mas não possui telemetria de touch/movimento nem detector de stall.
- `packages/ui-react-native/runtime/index.html` é o artefato sincronizado do runtime e deve ser regenerado pelo script existente após editar `runtime.js`.

## Sequência de implementação

1. Criar helpers puros e testes para telemetria/detecção de stall EPUB:
   - normalizar direção e métricas do container;
   - reconhecer apenas movimento esperado para cima, fora do topo e com scroll habilitado;
   - exigir três movimentos válidos sem redução relevante do offset dentro da janela temporal;
   - produzir payload causal sem alterar o comportamento normal.
2. Instrumentar o runtime de forma opt-in:
   - habilitar por configuração/global flag;
   - registrar scroll, touch, momentum/relocation, seleção, estado do manager, spine/progresso e comandos programáticos;
   - emitir `epub.scroll.stall` somente quando o detector confirmar a condição.
3. Reproduzir/medir na main-like antes e depois, se o emulador estiver disponível; caso contrário, registrar a limitação e validar com testes/runtime estático.
4. Usar a evidência para corrigir somente a causa encontrada. Prioridade: impedir que uma navegação programática/restore ou lifecycle do manager sobrescreva o scroll reverso ativo. Não introduzir outro scroll owner nem tocar no PDF.
5. Adicionar testes de regressão para:
   - scroll reverso monotônico;
   - restore não competir com interação ativa;
   - navegação programática vencer quando não há interação;
   - seleção/lock lifecycle;
   - ausência de stall artificial no fluxo normal.
6. Sincronizar `index.html`, rodar a suíte focada e a suíte completa proporcional ao risco, e documentar diagnóstico, causa, arquivos alterados e validação.

## Critérios de aceite

- Não há stall reproduzível em 10 ciclos down/up no EPUB longo testado.
- Scroll para baixo, fling, seleção, links, chrome, navegação interna e progresso permanecem funcionais.
- O detector é opt-in e não gera spam no modo normal.
- Não há alteração em PDF, pinch, FlatList, engine PDF ou arquitetura global.
- O teste automatizado cobre o contrato causal e o artefato runtime está sincronizado.

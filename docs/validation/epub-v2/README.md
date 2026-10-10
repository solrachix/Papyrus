# EPUB 2.0 — candidato para validação

Bases: Papyrus main `4bb0abb`, aplicativo thoth-stack `6ac33054`.

## Evidência obtida em 2026-10-10

- Exemplo do SDK, Pixel 7 API 35, Android, APK debug já instalado + bundle desta worktree. Fixture sintética com três capítulos longos (80 parágrafos por capítulo), identificadores de trechos, link, tabela e parágrafo RTL. Não é evidência de TestFlight nem de build Release.
- EPUB abre paginado. Swipe avança/retorna páginas visuais do mesmo capítulo. Indicador separa capítulo e página visual.
- Toque alterna chrome; controles ocultos permanecem ocultos durante navegação. Modo de rolagem também aceita ocultação.
- Long press seleciona palavra e apresenta menu nativo com ações em português. Nota digitada é salva e seu indicador abre o comentário.
- Indicador abriu a mesma nota após aumentar a fonte (pixel-note-reflow.png). Editor apresenta quatro ícones com labels e estado ativo (pixel-note-icons.png).
- Aumento de fonte e alternância paginado/rolagem mantêm a região textual por CFI. Rolagem continua funcional após alternância.
- 25 testes focados (incluindo editor, ações com ícones e salvar/cancelar): política/gestos iframe, bridge runtime, troca concorrente de modo, CFI/localização e anotações/reflow.
- Build UI/DTS e lint focado passaram. Tipos/core/engine foram construídos para os candidatos.
- Suite geral não está integralmente verde: erros de ambiente/dependências e um contrato nativo de comic também reproduzido na base, registrados em `/tmp/epub-full-tests.log` e `/tmp/epub-baseline-native.log`.

## Ainda precisa de validação

- iPhone/WKWebView real ou simulator macOS; Release nas duas plataformas.
- Rotação física, capítulos com imagens/fontes embutidas/CSS complexo, livro RTL completo, acessibilidade e todas as transições de capítulo.
- Persistência após reabrir no aplicativo e sincronização entre dispositivos. CFI/modo novos estão armazenados localmente por conta e arquivo; API remota mantém progresso/capítulo legado.
- Smoke completo do aplicativo com o SDK candidato; os testes de tela acima são do exemplo do SDK.

Não publicar este candidato como versão final nem tratar testes unitários como prova desses cenários pendentes. PR de implementação em draft. Sem npm, OTA ou build de loja nesta entrega.

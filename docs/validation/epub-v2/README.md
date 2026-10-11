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
- Persistência após reabrir no aplicativo e sincronização entre dispositivos. O app tem contrato remoto versionado e migration preparada; a integração HTTP/banco e sincronização real ainda não foram validadas.
- O smoke do app completo está registrado em ebooks-manager #149; os registros acima continuam sendo do exemplo do SDK.

Não publicar este candidato como versão final nem tratar testes unitários como prova desses cenários pendentes. PR de implementação em draft. Sem npm, OTA ou build de loja nesta entrega.


## Smoke adicional no app completo — 2026-10-10

App Debug no Pixel com fixture sintético local e runtime HTML desta worktree sobre UI publicada `.epub.1`. Não é validação do pacote publicado/Release.

- Coluna 2 tinha offset 411.428588867 CSS px para pageWidth 412. O floor do epub.js reportava página 1. Normalização restrita a 1 CSS px de um limite LTR corrige contador e estado de voltar; fora da tolerância/RTL o dado original é preservado.
- Editor/teclado alteravam viewport: CFI inicial `/4/12/1:149` virava `/4/12/1:97` durante resize. Fechar restaurava a página anterior. Resize agora recebe a mesma âncora lógica até navegação real; teardown restaura método original.
- Toque, seleção e marcador não invalidam âncora. Rolagem vertical real, link e navegação explícita invalidam; callbacks de sessão antiga são ignorados.
- No app, nota na página 2 continuou na página 2 após salvar; reiniciar processo retomou CFI 149. Setas 2 → 3 → 2, seleção, nota/indicador e chrome oculto durante swipe foram conferidos.
- 30 testes focados passaram (epubReader, epubAnnotationEvents, comicRuntime); build UI/DTS e diff-check passaram.

Essas correções adicionais ainda precisam de nova versão UI e atualização do consumidor. Não empacotar conteúdo alterado sob uma versão já publicada. Continuam pendentes iOS/WKWebView, Release, orientação, conteúdo heterogêneo e sincronização remota.

## Auditoria adicional do runtime e menu iOS — 2026-10-10

- Os testes do bridge agora carregam `epubReader.js` e `epubAnnotations.js` antes de `runtime.js`, como faz o HTML do WebView, e o mock do epub.js inclui o `manager.resize` que o runtime decora para preservar o CFI. 33 testes focados de runtime, CFI, seleção e anotações passaram.
- O app fixa `react-native-webview` 13.16.1. A API pública de `menuItems` aceita apenas `key` e `label`, e a implementação iOS cria `UICommand` sem imagem. Portanto os ícones nas ações de seleção EPUB não são configuráveis por essa API; mantemos o menu nativo e a seleção existente. Adicionar ícones exigiria mudar o componente nativo/fork e validar as ações de seleção no WKWebView.
- Não houve validação em iPhone ou simulador iOS nesta auditoria. A cobertura automatizada não comprova gestos, alças, persistência nem aparência no WKWebView real.

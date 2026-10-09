# PLANO INTEGRADO — PAPYRUS + PAPEL AMASSADO
## Estabilização de quadrinhos, anotações EPUB/TXT e notas interativas dentro dos livros

### Objetivo da entrega

Quero uma atualização integrada nos repositórios `solrachix/Papyrus` e `solrachix/ebooks-manager` (app *Papel Amassado*).

Esta entrega deve solucionar as pendências identificadas no code review da estabilização do leitor CBR/CBZ e, ao mesmo tempo, implementar um sistema consistente de anotações e notas contextualizadas para PDF, EPUB e TXT.

**Tudo deve fazer parte da mesma entrega funcional**, ainda que tecnicamente seja necessário trabalhar com commits ou PRs dependentes em cada repositório.

Não quero apenas habilitar botões de anotação. Quero que o usuário consiga criar, visualizar, editar, navegar e sincronizar suas marcações dentro do conteúdo que está lendo.

A implementação deve considerar performance, persistência, animações, acessibilidade, compatibilidade com os leitores existentes e validação nativa.

---

# 1. Estado atual e branches

## Repositórios

- SDK: `solrachix/Papyrus`
- App: `solrachix/ebooks-manager`
- Base principal do SDK: `main`
- Base principal do app: `thoth-stack`
- Branch utilizada na estabilização anterior: `codex/comic-reader-stability-20261009`

Commits de referência:

- Papyrus: `cae8e78`
- App: `08b072a1`

Na última revisão, a branch do aplicativo estava 12 commits atrás da `thoth-stack`, enquanto a branch Papyrus incluía commits adicionais relacionados ao PencilKit.

**Primeiro verifique novamente o estado real das branches.** Não assuma que essa divergência continua igual.

Atualize e reconcilie as branches antes de implementar novas mudanças. Preserve o trabalho existente, sem sobrescrever correções de importação, leitura, anotações ou PencilKit.

Inspecione os códigos atuais e não trabalhe com versões antigas do que já está implementado.

---

# 2. Estabilização definitiva do leitor CBR/CBZ

O trabalho anterior melhorou a leitura nativa, mas o code review identificou pontos que precisam ser validados e, se necessário, corrigidos antes do merge.

## 2.1. Eliminar saltos inesperados de rolagem no iOS

Arquivo principal:

`packages/engine-native/ios/PapyrusComicDocumentView.m`

O renderer utiliza `UICollectionView` e recebe imagens de forma assíncrona.

A implementação anterior passou a preservar posições relativas quando as dimensões das páginas mudam. Entretanto, `restoreScrollAnchor` pode executar `setContentOffset` enquanto o usuário está interagindo com a lista.

Investigar e corrigir:

- Reposicionamento durante arraste ativo.
- Reposicionamento durante desaceleração.
- Recalcular alturas quando imagens terminam de carregar.
- Invalidação de layout durante decodificação.
- Mudança de orientação.
- Alterações do modo contínuo ou página única.
- Atualizações redundantes de propriedades nativas.
- Restauração inicial de páginas anteriormente salvas.
- Mudança do tamanho de viewport.
- Descarte e reutilização de imagens do cache.

### Regras

A navegação solicitada explicitamente pelo usuário precisa ser diferenciada de alterações internas de layout.

Não deve haver scroll programático inesperado em resposta a uma simples renderização de imagem.

Preservar o ponto de leitura, idealmente por uma âncora estável formada pela página e pela posição relativa dentro dela.

Não interferir na inércia natural do scroll. Se for necessário compensar mudanças no tamanho de páginas anteriores, fazer isso sem provocar trancos perceptíveis.

Evitar loops entre:

`onPageChanged → setDocumentState → currentPage → scrollToCurrentPage`

Eventos de página visível não devem acionar uma nova navegação para a mesma página.

### Validação

Executar testes com quadrinhos de:

- 20 páginas;
- aproximadamente 70 páginas;
- 100 ou mais páginas;
- imagens com proporções diferentes.

Testar rolagem rápida, lenta, movimentos interrompidos, voltar a uma página anterior, reabrir o livro e continuar da página salva.

Priorizar validação real em iPhone. O teste do Pixel não substitui a validação do renderer Objective-C.

## 2.2. Visão de páginas com miniaturas

O indicador de progresso de quadrinhos deve abrir o painel **Páginas**, e não uma lista genérica de percentuais.

Manter a implementação recente que utiliza `getPagePreview()`.

Requisitos:

- Miniaturas reais para CBR e CBZ.
- Geração sob demanda.
- Cache limitado.
- Grade responsiva.
- Indicação clara da página atual.
- Toque para navegar à página.
- Placeholders enquanto imagens carregam.
- Tratamento de arquivos corrompidos.
- Evitar solicitações duplicadas.
- Cancelar ou ignorar resultados assíncronos obsoletos.
- Não disparar decodificação desnecessária de todas as páginas simultaneamente.

Não carregar todas as imagens de um quadrinho grande na memória apenas para exibir miniaturas.

## 2.3. Topbar

Revisar o alinhamento do Topbar no iOS.

O título precisa ficar verticalmente alinhado ao botão de voltar e ao botão de configurações, independentemente do tamanho da fonte, safe area e orientação.

Testar títulos longos e nomes curtos.

Preservar truncamento, áreas de toque e acessibilidade.

Não utilizar compensações fixas específicas de um único iPhone.

## 2.4. Controles específicos para quadrinhos

Manter a pesquisa textual oculta em CBR/CBZ enquanto não existir OCR ou uma camada de texto pesquisável.

Não exibir ferramentas que parecem funcionar, mas não realizam nenhuma ação.

Preservar navegação, progresso, miniaturas, zoom, informação e notas livres do livro.

**Não implementar desenho livre sobre CBR/CBZ nesta entrega.** Isso pode ser uma evolução futura com ancoragem própria em coordenadas de imagem.

---

# 3. Suporte real a anotações em EPUB

## Objetivo

Permitir selecionar texto EPUB e criar marcações persistentes, que acompanhem o conteúdo quando o layout for modificado.

Ferramentas previstas:

- Destacar texto.
- Sublinhar.
- Riscar texto.
- Adicionar nota vinculada ao trecho.
- Editar nota.
- Excluir marcação ou nota.
- Alterar cor do destaque.
- Navegar até uma marcação salva.

## 3.1. Integração com epub.js

Inspecionar:

- `packages/engine-epub/index.ts`
- `packages/ui-react-native/components/WebViewViewer.tsx`
- Runtime WebView do Papyrus.
- Bridge de mensagens entre WebView e React Native.

O EPUB utiliza conteúdo HTML, mas não deve depender de coordenadas absolutas da tela.

Implementar seleção de texto com captura de âncoras estáveis usando EPUB CFI, quando aplicável.

A seleção deve fornecer:

- Texto selecionado.
- Referência ao capítulo/spine.
- CFI inicial e final, ou uma CFI de intervalo.
- Contexto textual de recuperação.
- Identificador do documento.
- Informações necessárias para reabrir a seleção.

A API de anotação deve ser tipada, validada e desacoplada do componente visual.

Utilizar as capacidades de marcação do epub.js sempre que possível, em vez de reconstruir toda a seleção do navegador manualmente.

## 3.2. Persistência dos destaques

Depois de selecionar e destacar uma frase, o destaque precisa permanecer correto ao:

- Aumentar ou diminuir a fonte.
- Alterar margens.
- Alterar espaçamento.
- Trocar tema.
- Girar o dispositivo.
- Fechar e reabrir o livro.
- Navegar entre capítulos.
- Desmontar e remontar o conteúdo da WebView.

Não armazenar a posição em pixels como referência definitiva.

A renderização deve reconstruir os destaques utilizando as âncoras do conteúdo.

Se uma âncora não puder ser resolvida após uma mudança no arquivo, utilizar o texto e o contexto como estratégia controlada de recuperação.

Nunca posicionar uma nota em outro trecho aleatório apenas porque a âncora falhou.

## 3.3. Seleção e menu contextual

Ao selecionar texto, mostrar um menu de ações compacto:

**Destacar · Sublinhar · Riscar · Adicionar nota**

Permitir alterar a cor da marcação.

Evitar que o menu nativo e o menu personalizado apareçam simultaneamente de maneira conflituosa.

Garantir seleção funcional em iOS e Android.

A seleção não deve provocar scroll inesperado, remontagem da WebView ou mudança de capítulo.

---

# 4. Suporte real a anotações em TXT

## Objetivo

Entregar as mesmas funcionalidades textuais do EPUB, adaptadas ao renderer nativo de TXT.

Arquivos relevantes:

- `packages/ui-react-native/components/NativeTextDocumentViewer.tsx`
- `packages/engine-native/ios/PapyrusTextDocumentView.m`
- `packages/engine-native/android/.../PapyrusTextDocumentView.java`

O TXT já possui infraestrutura para identificar início e fim de seleções de texto.

Reutilizar essas posições.

## 4.1. Modelo de âncora

Para TXT, utilizar intervalos de texto estáveis vinculados ao documento.

Exemplo conceitual:

- Posição inicial.
- Posição final.
- Trecho textual original.
- Contexto anterior.
- Contexto posterior.
- Identificação da versão do conteúdo.

Garantir comportamento consistente com UTF-16, Unicode, emojis, caracteres combinados e diferentes quebras de linha.

Evitar erros de posição causados por diferenças de normalização de texto.

## 4.2. Renderização

Aplicar destaques, sublinhados, tachados e indicadores de notas diretamente sobre o conteúdo do renderer.

A marcação deve continuar acompanhando o texto ao mudar tamanho da fonte, margens e largura disponível.

Não depender de um overlay absoluto desacoplado das posições dos caracteres.

Preservar seleção nativa, scroll, busca e navegação por offsets.

---

# 5. Notas renderizadas diretamente no conteúdo

**Esta é uma das principais funcionalidades desta entrega.**

Não quero que notas vinculadas a trechos existam apenas na aba Notas.

O usuário precisa perceber dentro do livro que existe uma anotação naquele ponto.

## 5.1. Experiência desejada

Fluxo:

1. O usuário seleciona uma frase.
2. Escolhe "Adicionar nota".
3. Digita sua observação.
4. Salva.
5. O trecho fica visualmente identificado.
6. Surge um pequeno indicador de nota associado à seleção.
7. Ao tocar no indicador ou no trecho marcado, a nota abre.
8. O usuário pode ler, editar, excluir ou fechar.
9. Ao fechar, permanece na mesma posição do livro.

Exemplo:

Trecho selecionado: "Aquela descoberta mudaria tudo."

Nota: "Isso parece antecipar a revelação do último capítulo."

A página deve mostrar o trecho marcado e um indicador discreto de nota.

**Não exigir que o usuário abra a aba Notas para consultar essa informação.**

## 5.2. Representação visual

Criar um marcador compacto, com ícone de comentário ou nota.

Características:

- Visível, mas discreto.
- Com contraste adequado.
- Compatível com temas claro, escuro e sépia.
- Sem cobrir palavras.
- Sem bloquear seleção e rolagem.
- Com área de toque acessível.
- Associado a uma âncora real do conteúdo.
- Consistente entre PDF, EPUB e TXT.

Não transformar a página em uma coleção de post-its gigantes.

Utilizar uma linguagem visual compartilhada para o indicador, mas respeitar as diferenças técnicas entre renderers.

Quando houver vários comentários muito próximos, evitar sobreposição. Considerar agrupamento, indicador com contagem ou seleção contextual.

## 5.3. PDF — revisar e aprimorar o comportamento existente

O SDK já possui `PapyrusCommentPdfAnnotation`, além de eventos como `onAnnotationTap`.

Antes de implementar uma nova camada, investigar essa infraestrutura.

Quero preservar o comportamento nativo existente e melhorá-lo.

Ao adicionar uma nota vinculada à seleção:

- Associar a nota ao trecho correto.
- Manter uma indicação visual no texto.
- Exibir o marcador clicável.
- Permitir abrir a nota pelo toque.
- Preservar marcações, retângulos e posições em coordenadas de página.
- Funcionar com zoom, rotação e páginas de tamanhos diferentes.

Verificar se o comentário criado a partir de uma seleção destaca efetivamente o trecho ou apenas desenha um marcador sobre um retângulo.

Quando necessário, permitir nota e destaque na mesma seleção.

Não duplicar anotações existentes e não quebrar o PencilKit.

## 5.4. EPUB — marcador dentro da WebView

O indicador deve ser associado à CFI da seleção.

Preferir renderizar a decoração na própria camada do conteúdo HTML/epub.js, mantendo a vinculação à âncora.

A posição do marcador deve acompanhar automaticamente mudanças de fonte e layout.

Ao tocar, enviar um evento tipado pela bridge para o React Native, identificando a anotação.

Não depender de coordenadas calculadas uma única vez.

Não criar um marcador absoluto sobre a WebView que permaneça parado enquanto o texto se desloca.

## 5.5. TXT — marcador associado ao intervalo de texto

Utilizar as posições nativas do trecho para descobrir a área visível da seleção.

O marcador deve acompanhar a posição renderizada dos caracteres.

Atualizar sua geometria quando necessário, sem recalcular todas as anotações em cada frame de scroll.

Preservar hit-testing, seleção e acessibilidade.

## 5.6. Visualização rápida da nota

Ao tocar no marcador, abrir uma apresentação contextual.

Preferência visual:

- Popover próximo ao trecho quando houver espaço.
- Apresentação compacta adaptada à tela em celulares.
- Nunca cobrir completamente a leitura sem necessidade.

Conteúdo:

- Trecho selecionado.
- Texto completo da nota.
- Data, se relevante.
- Cor da marcação.
- Ações: Editar, Excluir e Fechar.

O usuário não deve ser levado automaticamente a outra tela para ler uma nota curta.

O popover deve funcionar acima do conteúdo nativo ou da WebView, sem conflitos de camadas.

Ao abrir, não movimentar o livro desnecessariamente.

Ao fechar, preservar posição, zoom e seleção quando apropriado.

## 5.7. Editor de notas

Reutilizar ou evoluir `AnnotationEditor.tsx`.

Deve permitir:

- Criar nota a partir de texto selecionado.
- Editar o texto.
- Alterar a cor da marcação.
- Escolher entre destaque, sublinhado ou somente indicador.
- Salvar.
- Cancelar sem perder dados anteriores.
- Excluir com confirmação quando apropriado.

Não limitar o campo a uma única linha.

Garantir integração com teclado, safe areas e botões acessíveis.

---

# 6. Nota e marcação devem funcionar juntas

Quero que uma mesma seleção de texto possa conter uma nota e uma marcação visual.

Exemplos:

- Trecho destacado em amarelo com nota.
- Trecho sublinhado em azul com nota.
- Trecho marcado apenas por indicador de comentário.
- Trecho destacado sem nota.

Não obrigar o usuário a criar duas anotações independentes para obter destaque e comentário, caso um único registro extensível resolva melhor o problema.

Investigar o modelo atual `Annotation`.

Preservar compatibilidade com os tipos existentes:

- `highlight`
- `underline`
- `squiggly`
- `strikeout`
- `text`
- `comment`
- `ink`

Propor uma extensão compatível para distinguir:

1. Âncora do conteúdo.
2. Estilo da marcação.
3. Conteúdo textual da nota.
4. Cor.
5. Identificador estável.
6. Informações de localização e sincronização.

Não transformar alterações no conteúdo da nota em duplicação de registros.

---

# 7. Modelo de dados e âncoras por formato

Quero uma interface comum para anotações, mas mecanismos de localização específicos por formato.

## PDF

Utilizar página e geometria normalizada, respeitando a seleção nativa e os retângulos de marcação.

## EPUB

Introduzir uma representação tipada de âncora contendo, conforme a implementação escolhida:

- Tipo `epub-cfi`.
- Capítulo ou spine href.
- CFI de início.
- CFI de fim.
- Trecho original.
- Prefixo e sufixo de contexto.
- Identificador ou versão do documento.

## TXT

Introduzir uma representação tipada contendo:

- Tipo `text-range`.
- Offset inicial.
- Offset final.
- Convenção de codificação/normalização.
- Trecho original.
- Prefixo e sufixo de contexto.
- Identificador ou versão do documento.

## Compatibilidade

Manter o carregamento de anotações antigas que possuem apenas `pageIndex`, `rect`, `rects` ou `textRange`.

Não exigir uma migração destrutiva.

Não converter automaticamente anotações antigas para âncoras incorretas.

Validar payloads e impedir criação de âncoras inválidas.

---

# 8. Sincronização com o Papel Amassado

O aplicativo já possui infraestrutura de anotações e sincronização:

- Store de anotações do Papyrus.
- `readingAnnotationOutbox`.
- `readingAnnotationApi`.
- Endpoint de anotações da biblioteca.
- Escopo de arquivo.
- Tela de Notas e Anotações.

Reutilizar essa infraestrutura.

### Requisitos

- Salvar localmente antes de sincronizar.
- Funcionar offline.
- Reenviar alterações pendentes.
- Preservar os mesmos IDs após reabrir o livro.
- Não duplicar notas após retry.
- Não perder notas em falhas de rede.
- Respeitar a conta autenticada.
- Respeitar o `book_file_id`, quando aplicável.
- Não misturar posições de duas edições diferentes do mesmo livro.

Investigar cuidadosamente o endpoint atual de substituição de anotações.

Evitar que um snapshot antigo substitua e apague anotações novas criadas em outro dispositivo.

Se necessário, introduzir versionamento, revisão ou operações incrementais com resolução segura de conflitos.

Preservar compatibilidade com dados já existentes.

### Notas livres versus notas do leitor

Hoje existem duas categorias:

**Nota livre:** vinculada ao livro, mas sem um trecho específico.

**Nota contextual:** criada dentro do leitor e vinculada a uma âncora real.

Ambas devem aparecer na área de Notas, com distinção clara.

Apenas notas com âncora válida devem produzir um indicador sobre o conteúdo.

Uma nota livre não deve aparecer arbitrariamente em uma página.

---

# 9. Integração com a aba Notas

Preservar a área de Notas existente no aplicativo.

Quero que ela continue permitindo consultar todas as anotações.

Porém, sua função passa a ser complementar à leitura contextual.

### Comportamento esperado

Ao tocar em uma anotação da lista:

- PDF: navegar à página e ao trecho.
- EPUB: navegar ao capítulo e à CFI.
- TXT: navegar ao offset correspondente.
- Nota livre: abrir os detalhes da nota, sem inventar localização.

Depois da navegação, destacar brevemente o destino e oferecer acesso ao comentário.

Não navegar somente até o início do capítulo quando existe uma âncora mais precisa.

Usar a mesma identidade e o mesmo conteúdo da anotação na página e na lista.

Preservar o componente de post-it utilizado nas telas de anotações, mas não reutilizá-lo como marcador dentro do livro.

**Post-it completo é para listagem. Indicador compacto é para o conteúdo.**

---

# 10. Motion, transições e experiência visual

As animações devem ser refinadas, discretas e consistentes com o aplicativo.

## Seleção de texto

Quando o usuário selecionar uma frase:

- Mostrar ações com transição suave.
- Evitar mudanças bruscas no scroll.
- Preservar a seleção durante a escolha de ferramenta.
- Não bloquear gestos nativos.

## Criação da nota

Ao selecionar "Adicionar nota":

- Abrir o editor com uma transição suave.
- Focar o campo sem deslocar o conteúdo de forma indevida.
- Respeitar teclado e safe areas.
- Preservar a seleção até a confirmação.

## Ao salvar

- Fechar o editor.
- Aplicar a marcação.
- Mostrar o indicador da nota com uma pequena transição de opacidade e escala.
- Não dar feedback de sincronização concluída antes da confirmação real.

## Ao tocar no indicador

- Abrir o popover contextual com transição de aproximadamente 180–250 ms.
- Usar fade e deslocamento discreto.
- Preservar a posição de leitura.
- Fechar com animação reversa.

## Requisitos técnicos

- Preferir padrões de Reanimated já presentes no projeto para a camada React Native.
- Não animar continuamente marcadores durante scroll.
- Não introduzir trabalho pesado na thread JS enquanto o usuário lê.
- Respeitar preferência de movimento reduzido.
- Evitar múltiplas apresentações nativas simultâneas.
- Garantir cancelamento correto de animações interrompidas.

---

# 11. Performance

O sistema deve continuar responsivo com documentos grandes.

Testar:

- EPUB com muitos capítulos.
- TXT extenso.
- PDF com muitas páginas.
- Livro contendo mais de 100 anotações.
- Várias anotações em um único parágrafo.
- Troca de fonte e tema.
- Rolagem rápida.

### Diretrizes

- Renderizar indicadores somente quando necessário.
- Indexar anotações por capítulo, página ou intervalo.
- Evitar varrer todas as anotações em cada frame.
- Evitar bridges excessivas entre WebView e React Native.
- Não remontar o EPUB inteiro após salvar uma nota.
- Preservar cache, virtualização e mecanismos de leitura existentes.
- Não causar jank durante seleção, destaque ou scroll.

---

# 12. Segurança e confiabilidade

Validar e sanitizar conteúdos enviados pela WebView.

Não interpretar texto digitado em notas como HTML executável.

Não permitir execução de scripts vindos de uma nota sincronizada.

Usar mensagens tipadas na bridge.

As ações de criar, editar e excluir precisam respeitar o documento, a conta e o escopo corretos.

Anotações com âncoras que não possam ser resolvidas devem continuar acessíveis pela lista, com indicação apropriada, sem posicionamento falso dentro do texto.

---

# 13. Testes automatizados

Adicionar testes que validem comportamento, não somente a existência de trechos de código.

## CBR/CBZ

- Scroll contínuo sem salto.
- Decodificação tardia.
- Layout e âncora.
- Mudança de orientação.
- Navegação manual.
- Restauração de página salva.
- Cache de dimensões.
- Miniaturas.
- Arquivos corrompidos.
- Alternância contínuo/página única.

## EPUB

- Captura correta de seleção.
- Criação de CFI.
- Persistência de marcação.
- Reaplicação após reflow.
- Mudança de fonte.
- Mudança de tema.
- Navegação por anotação.
- Criação e edição de nota.
- Toque no indicador.
- Recuperação controlada de âncora inválida.

## TXT

- Seleção por intervalo.
- Destaque persistente.
- Nota contextual.
- Indicador clicável.
- Unicode e emojis.
- Mudanças de quebras de linha.
- Reflow.
- Atualização de fonte.
- Navegação por offset.

## PDF

- Preservar destaques existentes.
- Preservar PencilKit.
- Criar nota sobre seleção.
- Renderizar marcador.
- Tocar para abrir nota.
- Editar nota.
- Excluir nota.
- Reabrir documento.
- Zoom e rotação.

## Sincronização

- Offline.
- Retry.
- Múltiplos dispositivos.
- Duplicação.
- Alteração de nota.
- Exclusão.
- Troca de arquivo do mesmo livro.
- Restauração de dados antigos.
- Regressão nas notas livres.

---

# 14. Testes em dispositivos

Não considerar a entrega concluída somente por passar em Jest, lint e build de pacotes.

## Android

Utilizar emulador ou Pixel/Poco disponível.

Testar CBR/CBZ, EPUB, TXT e PDF.

## iOS

Executar compilação nativa e smoke em simulador ou dispositivo físico.

O smoke de quadrinhos precisa exercitar `PapyrusComicDocumentView.m`.

Testar especialmente:

- Rolagem rápida e lenta.
- Layout do Topbar.
- Miniaturas.
- Retorno ao progresso salvo.
- Seleção de texto no EPUB.
- Popover de nota na WebView.
- Teclado.
- Seleção e indicadores no TXT.
- PencilKit e comentários no PDF.

Se o ambiente não possuir acesso ao iOS, declarar que a validação está pendente e não chamar a implementação de aprovada em dispositivo.

---

# 15. Pendências conhecidas dos checks

A execução anterior informou:

- 79 testes focados aprovados.
- Builds de pacotes aprovados.
- Worklets aprovados.
- Lint e diff-check aprovados.
- Um teste antigo de Notas falhando.
- Dois erros TypeScript em `ReviewSharePreview`.

Confirmar se essas falhas ainda existem na base atual.

Separar claramente falhas anteriores de regressões introduzidas.

Como esta implementação altera anotações e Notas, revisar a falha antiga da área de Notas e garantir que os fluxos afetados estejam passando.

Não ignorar testes falhando silenciosamente.

---

# 16. Versionamento, builds e distribuição

Este trabalho altera múltiplos pacotes do Papyrus.

Verificar quais deles exigem novas versões, incluindo potencialmente:

- `@papyrus-sdk/types`
- `@papyrus-sdk/core`
- `@papyrus-sdk/engine-epub`
- `@papyrus-sdk/engine-native`
- `@papyrus-sdk/ui-react-native`

Atualizar dependências e lockfiles de maneira consistente.

Não considerar que o app utilizará código novo do SDK sem atualizar as versões instaladas.

As alterações nativas do renderer de quadrinhos e de TXT exigirão novo binário dos aplicativos correspondentes.

Não tentar distribuí-las apenas por OTA.

## Ordem de integração

1. Atualizar bases e reconciliar branches.
2. Implementar e validar contratos compartilhados.
3. Corrigir renderers e engines do Papyrus.
4. Implementar componentes e ferramentas de anotação.
5. Integrar as alterações ao *Papel Amassado*.
6. Validar sincronização e telas de Notas.
7. Executar testes ampliados.
8. Realizar smoke Android e iOS.
9. Preparar versões dos pacotes.
10. Preparar a nova build nativa do aplicativo.

Separações em PRs dependentes são permitidas, mas devem compor uma única entrega integrada.

Não publicar npm, fazer merge, distribuir OTA ou gerar build de produção sem autorização explícita.

---

# 17. Critérios de aceite obrigatórios

A entrega só estará pronta quando estes cenários funcionarem:

### Cenário A — EPUB

Abro um EPUB, seleciono uma frase, destaco em amarelo, adiciono uma nota, salvo, vejo o indicador no texto e consigo tocar para ler minha nota.

Aumento a fonte, fecho o livro e abro novamente. A marcação e o indicador continuam no trecho correto.

### Cenário B — TXT

Abro um TXT, seleciono um parágrafo, sublinho e adiciono uma nota.

Mudo o tamanho da fonte, continuo a leitura e retorno. A nota continua vinculada ao intervalo correto.

### Cenário C — PDF

Seleciono uma frase, adiciono uma nota e vejo um indicador clicável na página.

Consigo abrir, editar e excluir a nota diretamente a partir da leitura.

Os destaques anteriores e o PencilKit continuam funcionando.

### Cenário D — Central de Notas

Abro a aba Notas e encontro as anotações de todos os formatos.

Toco numa anotação vinculada a texto e sou levado ao trecho correspondente.

Notas livres continuam acessíveis mesmo sem âncora.

### Cenário E — Quadrinhos

Abro um CBR/CBZ com aproximadamente 70 páginas.

Percorro o livro rapidamente sem saltos inesperados.

Abro o painel de páginas, visualizo miniaturas, escolho uma página, saio do livro e retorno à página salva.

### Cenário F — Falha de rede

Crio uma nota offline, fecho o aplicativo, reabro e vejo a anotação.

Quando a conexão volta, a sincronização ocorre sem duplicar ou apagar a nota.

---

# 18. Entrega final e relatório

Ao concluir:

- Revisar o diff dos dois repositórios.
- Informar todas as branches e commits.
- Fazer commit e push.
- Preparar PRs vinculadas.
- Descrever mudanças por pacote.
- Informar testes executados e resultados reais.
- Documentar falhas conhecidas e pendências.
- Indicar quais mudanças exigem build nativa.
- Informar versões preparadas.
- Não fazer merge ou publicação sem autorização.

### Resultado esperado

Quero que o Papyrus evolua de um leitor que possui algumas ferramentas de anotação para um leitor em que as anotações são parte integrada do conteúdo.

**O usuário seleciona, marca, comenta, visualiza a nota dentro do livro, navega até ela e encontra tudo sincronizado na sua biblioteca.**

Isso deve funcionar em PDF, EPUB e TXT, com a melhor implementação para cada formato.

Ao mesmo tempo, o CBR/CBZ precisa ficar estável, com rolagem correta, miniaturas e navegação confiável.

A experiência deve parecer um produto único, com componentes compartilhados, comportamento consistente e motion refinado — não um conjunto de funcionalidades independentes.
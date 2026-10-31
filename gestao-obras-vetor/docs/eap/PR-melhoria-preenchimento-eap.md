# Reformular a EAP e facilitar o preenchimento

Branch: `codex/feat/melhoria-preenchimento-eap` · Base: `origin/main` (`3a4f786`).

## Resumo

A EAP ganha uma composição visual mais legível, com navegação horizontal entre as ferramentas de Planejamento, mais largura para a tabela e indicadores de situação com maior contraste. Agrupadores, códigos, progresso e ações têm identificação própria, mantendo os temas claro e escuro e a adaptação ao celular.

O cadastro e a edição exigiam abrir um formulário separado para cada atividade. A tabela agora permite editar uma linha por vez e cadastrar atividades consecutivas, com salvamento explícito. O painel lateral compartilha o mesmo rascunho e reúne descrição, hierarquia, dependências e histórico.

O progresso continua vindo dos RDOs aprovados. Cálculos, pesos, regras de hierarquia, permissões e contratos das APIs foram preservados; não há alterações no backend nem migrações.

## O que foi feito

- Menu de Planejamento reorganizado em uma faixa horizontal com EAP, Curva S e Cronograma, preservando as ações e a confirmação de descarte.
- Novo cabeçalho, indicadores com ícones e destaque do total, busca e filtros integrados à área da tabela. Tipografia ampliada, códigos em etiquetas, agrupadores com fundo distinto, situação com marcadores e peso visualmente separado do executado.
- Tabela hierárquica com cabeçalho e identificação fixos, datas, unidade, quantidade prevista, peso, percentual, barra, situação e ações.
- Edição na linha com Salvar/Cancelar; criação de raízes e filhas; Salvar e adicionar outra mantém o pai, sugere o próximo código de filha e limpa os demais campos.
- Campos, validações e salvamento compartilhados entre tabela, painel e formulário das URLs existentes. Pai e predecessora podem ser pesquisados por código ou nome.
- Erros junto aos campos, indicação de obrigatoriedade e soma informativa dos pesos das irmãs. Nenhuma redistribuição de pesos.
- Busca e filtro por situação preservam os ancestrais. Percentuais são calculados antes da filtragem; os contadores gerais consideram somente atividades sem filhos.
- Proteção contra envio duplicado e descarte involuntário; falhas de gravação mantêm o rascunho. Se a gravação concluir e a atualização da lista falhar, o cadastro não é reenviado e novas edições aguardam a recarga.
- Tab/Shift+Tab, Ctrl+Enter, Escape e foco contido no painel. Os diálogos compartilhados passam a receber e conter o foco, permitindo responder às confirmações pelo teclado.
- Consulta adaptada ao celular e painel em largura completa, nos temas existentes. Filtros e expansão permanecem após o salvamento normal.
- Payload explícito preserva nome, descrição, quantidade, datas, unidade e peso. Não envia `percentual_executado` e omite dependências não editadas.
- Mantidos acesso pelo Planejamento, retorno ao cockpit, confirmação de recálculo, avisos de RDOs afetados, importação Excel, exclusão e recálculo manual.

## Validação

- Frontend: `npm.cmd run test:eap` — passou; cobre preservação dos campos enviados, dependências intactas/alteradas, hierarquia, filtros, contadores e sugestões de código.
- Frontend: `npm.cmd run test:cockpit` — passou.
- Backend: `npm.cmd run test:eap-progress` — passou.
- Backend: `npm.cmd run test:rdo-workflow` — passou, 15 cenários.
- Frontend: `npm.cmd run build` — passou.
- Repositório: `git diff --check` — passou.
- Navegador local com API simulada: cadastro de raiz/filha, cadastro consecutivo, edição preservando quantidade e dependências, confirmação de recálculo e aviso de RDOs afetados.
- Navegador: falha de gravação mantém rascunho; clique duplo não duplica envio; falha na consulta após POST bem-sucedido não repete o cadastro e permite recuperação por recarga.
- Navegador: cancelamento e troca de atividade/aba com alterações, Voltar do navegador recusado/aceito, formulário na URL existente e retorno pelo contexto do cockpit.
- Navegador: busca sem acentos, filtro de concluídas mantendo pai em 70%, histórico, Tab/Shift+Tab, Ctrl+Enter, Escape, foco e navegação das abas por setas. Conferida a abertura da importação, do recálculo manual e da confirmação de exclusão.
- Comparações de progresso: vários níveis, pesos zero, pesos cuja soma é inferior a 100% e filhos concluídos; filtros não alteram os resultados.
- Inspeção visual em 1920×1080, 1440×1000 e 390×844, com temas claro e escuro. Verificado alinhamento das colunas fixas e ausência de transbordamento da área de conteúdo no celular.
- Após a reformulação visual: `test:eap`, build e `git diff --check` passaram novamente. Conferidos rascunho compartilhado, gravação preservando quantidade e dependências, confirmação de recálculo, filtros mantidos após salvar e proteção ao trocar de ferramenta. Em uma árvore demonstrativa de 80 atividades executáveis, buscar uma filha manteve o avanço do agrupador em 92,15%.

## Riscos e pendências

- A validação no navegador usou dados sintéticos e respostas de API simuladas, sem alterar projetos reais. Importação de um arquivo Excel e recálculo com banco real não foram executados nesta entrega.
- O build mantém o aviso de bundle JavaScript superior a 500 kB; a divisão do bundle está fora do escopo.
- Os arquivos temporários de análise em `.playwright-mcp/` ficam fora da alteração. Não houve push, publicação de PR ou deploy.

## Evidências visuais

Capturas locais com dados sintéticos:

- [Planejamento e EAP, tema claro](visual-planejamento-claro.png)
- [Planejamento e EAP, tema escuro](visual-planejamento-escuro.png)
- [Hierarquia expandida](visual-hierarquia.png)
- [Edição na própria linha](visual-edicao.png)
- [Painel de detalhes](visual-painel.png)
- [Consulta no celular, tema claro](visual-celular-claro.png)
- [Consulta no celular, tema escuro](visual-celular.png)
- [Editor no celular](visual-editor-celular.png)

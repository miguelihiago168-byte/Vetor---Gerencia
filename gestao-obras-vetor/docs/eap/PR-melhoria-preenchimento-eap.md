# Facilitar o preenchimento e a consulta de progresso da EAP

Branch: `codex/feat/melhoria-preenchimento-eap` · Base: `origin/main` (`3a4f786`).

## Resumo

O cadastro e a edição da EAP exigiam abrir um formulário separado para cada atividade. A tabela agora permite editar uma linha por vez e cadastrar atividades consecutivas, com salvamento explícito. O painel lateral compartilha o mesmo rascunho e reúne descrição, hierarquia, dependências e histórico.

O progresso continua vindo dos RDOs aprovados. Cálculos, pesos, regras de hierarquia, permissões e contratos das APIs foram preservados; não há alterações no backend nem migrações.

## O que foi feito

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
- Inspeção visual em 1440×1000 e 390×844, com temas claro e escuro.

## Riscos e pendências

- A validação no navegador usou dados sintéticos e respostas de API simuladas, sem alterar projetos reais. Importação de um arquivo Excel e recálculo com banco real não foram executados nesta entrega.
- O build mantém o aviso de bundle JavaScript superior a 500 kB; a divisão do bundle está fora do escopo.
- Os arquivos temporários de análise em `.playwright-mcp/` ficam fora da alteração. Não houve push, publicação de PR ou deploy.

## Evidências visuais

Capturas locais com dados sintéticos:

- [Tabela no computador, tema claro](tabela-desktop.png)
- [Edição na própria linha](edicao-na-linha.png)
- [Painel de detalhes compartilhando o rascunho](painel-detalhes.png)
- [Tabela no tema escuro](tabela-tema-escuro.png)
- [Consulta no celular](consulta-celular.png)
- [Editor no celular, tema claro](editor-celular-claro.png)
- [Editor no celular, tema escuro](editor-celular.png)

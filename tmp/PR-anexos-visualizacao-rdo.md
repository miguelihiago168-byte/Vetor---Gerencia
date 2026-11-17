## Resumo

Corrige o envio e a exibição de anexos no Relatório Diário de Obra.

## O que foi feito

- O formulário confirma cada arquivo enviado, mantém as falhas na fila do mesmo RDO e aguarda os envios antes de solicitar aprovação.
- Depois da criação, o formulário passa a usar o identificador do RDO salvo.
- A consulta de detalhes inclui todos os formatos aceitos. A visualização oferece uma nova tentativa quando as duas consultas de anexos falham.

## Validação

- Build do frontend, verificação de sintaxe das duas rotas do backend e `git diff --check` concluídos.
- Teste no Chrome com formulário, rotas de upload, listagem e leitura de arquivos, e tabelas temporárias no PostgreSQL. Foram verificados a criação com dois anexos, uma falha parcial, a nova tentativa, um envio durante a edição e a abertura dos três arquivos na visualização.
- A indisponibilidade da consulta de anexos e a recuperação pelo botão de nova tentativa também foram verificadas.

## Riscos e pendências

Um arquivo que nunca chegou a ser gravado precisa ser selecionado novamente no RDO. O build emite um aviso sobre o tamanho do pacote JavaScript.

## Evidências visuais

O teste automatizado conferiu os nomes na seção Anexos e o conteúdo retornado por cada link.

## Resumo

Permite editar a duração do intervalo e gerenciar os nomes de equipamentos salvos nas sugestões do formulário RDO. Por exemplo, o usuário pode corrigir o nome de um equipamento ou excluí-lo das sugestões da obra, preservando os equipamentos registrados nos relatórios anteriores.

## O que foi feito

- Intervalo editável, sincronizado com o retorno do almoço e os horários da equipe; rótulo mantido como “Intervalo”.
- Ações de editar e excluir ao lado dos equipamentos sugeridos, com confirmação de exclusão e tratamento de erros.
- Persistência das alterações do catálogo por projeto, com validação de nome, isolamento por tenant e transação com bloqueio para atualizações concorrentes.
- Migration `000014_rdo_equipment_catalog`, aplicada ao banco local.

## Validação

- `npm.cmd run build` no frontend: aprovado; aviso de tamanho do bundle.
- `node tests/rdoEquipmentCatalogService.test.js`: aprovado.
- `node -r dotenv/config tests/rdoEquipmentCatalogDatabase.test.js`: aprovado no PostgreSQL com tabelas temporárias e rollback.
- `node --check routes/rdo_related.js`: aprovado.
- `git diff --check`: aprovado.

## Riscos e pendências

- Aplicar a migration `000014_rdo_equipment_catalog` nos demais ambientes antes de disponibilizar a alteração.
- Conferência visual pendente: nenhum navegador conectado disponível na sessão.

## Evidências visuais

Não capturadas; navegador indisponível.

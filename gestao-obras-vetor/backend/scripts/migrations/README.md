# Migration inicial

Este diretorio tem somente a migration de baseline `000001_initial_schema`.
Ela cria o schema atual completo em novas instalacoes e registra apenas uma
linha em `schema_migrations`.

Os passos incrementais anteriores foram preservados em
`../migration-history/` e sao executados internamente pela baseline. Eles nao
sao descobertos nem registrados individualmente pelo executor de migrations.

Use `npm run db:bootstrap-rls` (ou `npm run db:init`) em um banco PostgreSQL
vazio. O comando cria as tabelas base e, em seguida, aplica a baseline.

Em bancos que ja possuem todo o historico anterior em `schema_migrations`, o
executor reconhece a baseline como satisfeita e nao tenta reaplica-la. Para um
banco parcialmente migrado, conclua ou recrie a base antes de usar este formato.

Para mudancas futuras, crie uma nova migration numerada a partir de
`000002_...`, sem alterar a baseline ja publicada.

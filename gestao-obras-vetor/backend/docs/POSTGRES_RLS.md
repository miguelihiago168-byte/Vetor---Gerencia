# Banco compartilhado e RLS

O Vetor usa um único conjunto de tabelas PostgreSQL. Não crie schemas
`tenant_*` nem copie tabelas por CNPJ.

## Inicialização de uma base vazia

Execute `npm run db:bootstrap-rls`. O script cria as tabelas legadas ainda
necessárias à aplicação, aplica as migrations uma única vez e provisiona o
grupo/CNPJ inicial para o administrador padrão.

## Roles PostgreSQL

As migrations devem ser executadas com uma role proprietária separada. A role
configurada no backend (`DB_USER`) deve ter apenas os privilégios de DML
necessários e **não** pode ter `BYPASSRLS`, `SUPERUSER` ou ser dona das tabelas.

Cada consulta do backend é executada em transação curta e recebe `SET LOCAL`
para `app.user_id`, `app.tenant_id`, `app.group_id` e `app.role`. Nunca defina
essas configurações a partir de valores enviados pelo cliente; o middleware de
autenticação resolve o vínculo ativo em `usuario_tenants`.

## Escopos

- `tenant_id`: projetos, EAP, RDO, RNC, rastreabilidade, almoxarifado,
  mensagens, notificações, anexos e auditoria.
- `grupo_id`: fornecedores, requisições, itens, cotações, pedidos e catálogo
  de insumos. Cada requisição informa também o CNPJ e projeto de destino.
- Transferências de materiais e ferramentas só aceitam origem e destino no
  mesmo grupo e exigem aprovação de origem e destino.
# Roles

Use duas credenciais diferentes. `DB_MIGRATIONS_USER` executa bootstrap e migrations; `DB_USER` deve ser a role `gestao_app`, criada pela migration `000014`, que e explicitamente `NOSUPERUSER NOBYPASSRLS`. Em producao, defina senhas diferentes para `POSTGRES_PASSWORD` e `POSTGRES_APP_PASSWORD`.

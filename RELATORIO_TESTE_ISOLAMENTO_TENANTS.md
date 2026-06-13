# Relatorio de teste de isolamento de tenants

Data: 2026-06-13

Branch: `fix/multitenancy-isolation`

## Arquitetura final proposta

Banco principal:

- `tenants`
- autenticacao e usuarios globais
- `usuario_tenants`
- configuracoes globais
- trial e plano
- auditoria administrativa
- registro de bancos tenant

Banco tenant:

- metadados locais do tenant
- usuarios operacionais sincronizados quando necessario
- projetos
- `projeto_usuarios`
- EAP
- RDO, fotos e anexos
- RNC
- compras, requisicoes, fornecedores e almoxarifado
- notificacoes e mensagens do tenant
- auditoria operacional

## Fluxo seguro de criacao de tenant

1. Validar dados de entrada.
2. Criar registro do tenant inativo no banco principal.
3. Criar usuario administrador inicial no banco principal.
4. Criar vinculo em `usuario_tenants`.
5. Criar `tenant_<id>.db` a partir de schema limpo.
6. Aplicar migrations centralizadas no banco tenant.
7. Copiar apenas metadados essenciais do tenant, usuario inicial e vinculo.
8. Validar `schema_migrations`.
9. Validar `PRAGMA integrity_check`.
10. Validar `PRAGMA foreign_key_check`.
11. Ativar o tenant somente depois de todas as validacoes.

Se o banco `tenant_<id>.db` ja existir, o fluxo retorna `TENANT_DATABASE_ALREADY_EXISTS` e nao sobrescreve o arquivo.

## Helper central

Criado `backend/services/tenantProvisioning.js` com:

- `provisionTrialTenant`
- `createTenantDatabaseFromCleanSchema`
- `assertTenantReady`
- `getTenantDbPath`
- `createTenantError`

O helper valida tenant ativo, banco existente, migrations pendentes, integridade e chaves estrangeiras.

## Rotas corrigidas

- `/api/auth/register`: usa provisionamento seguro e ativa tenant apenas apos banco valido.
- `/api/auth/login`: bloqueia login quando o banco tenant esta ausente, divergente ou desatualizado.
- `/api/anexos`: novos uploads passam a usar `uploads/tenant_<id>/`.
- `/api/rdo/*/foto`: novas fotos passam a usar `uploads/tenant_<id>/`.
- `/api/auth/cancelar-conta`: nao remove mais fisicamente o arquivo tenant.

## Teste com Tenant X e Tenant Y

Teste automatizado: `npm run test:tenant`

Cenario executado:

- criar banco principal temporario;
- rodar inicializacao e migrations em `DB_DIR` temporario;
- criar Tenant X;
- criar Tenant Y;
- validar existencia dos dois bancos tenant;
- validar ambos com `assertTenantReady`;
- criar projeto no Tenant X;
- confirmar que o Tenant Y nao enxerga o projeto do Tenant X;
- tentar criar novamente o banco do Tenant X;
- confirmar falha com `TENANT_DATABASE_ALREADY_EXISTS`.

## Resultados

- Isolamento basico entre bancos tenant validado.
- Banco tenant duplicado bloqueado.
- Registro publico nao deixa tenant ativo sem banco valido.
- `ensureTenantDatabase()` nao copia nem recria banco tenant automaticamente.
- Novos anexos/fotos de RDO e RNC ficam separados por diretorio tenant.

## Falhas encontradas e corrigidas

- O registro publico criava tenant ativo sem garantir banco tenant correspondente.
- `ensureTenantDatabase()` ainda tinha fallback de desenvolvimento que copiava o banco principal para criar tenant.
- `ensureTenantDatabase()` ainda podia remover arquivo tenant divergente em ambiente nao-producao.
- A rota de cancelamento apagava o arquivo `tenant_<id>.db`.
- Uploads novos de RDO/RNC eram gravados em diretorio plano.

## Riscos restantes

- `/uploads` ainda e servido publicamente por `backend/server.js`; os novos caminhos por tenant reduzem mistura operacional, mas a remocao completa exige substituir links diretos no frontend e nos geradores de PDF por endpoints autenticados.
- Mensagens, notificacoes e Socket.IO precisam de teste automatizado dedicado para garantir ausencia de evento cruzado entre tenants.
- Compras, almoxarifado, email e avatar ainda devem passar por varredura especifica de uploads por tenant.
- Fluxos de exportacao/PDF ainda montam URLs diretas de upload e devem ser migrados antes do bloqueio total de `/uploads`.

## Versionamento

Commit: pendente ate conclusao dos testes finais.

Pull Request: pendente ate push da branch.

Deploy: nao executado.

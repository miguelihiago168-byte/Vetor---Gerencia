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
- `/api/uploads/*`: nova rota autenticada para servir arquivos sem exposicao publica direta.
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
- `/uploads` publico foi removido do servidor.
- Links diretos do frontend foram migrados para `/api/uploads` com token.
- RDO/RNC PDF passaram a usar imagem embutida quando precisam ler upload local.

## Falhas encontradas e corrigidas

- O registro publico criava tenant ativo sem garantir banco tenant correspondente.
- `ensureTenantDatabase()` ainda tinha fallback de desenvolvimento que copiava o banco principal para criar tenant.
- `ensureTenantDatabase()` ainda podia remover arquivo tenant divergente em ambiente nao-producao.
- A rota de cancelamento apagava o arquivo `tenant_<id>.db`.
- Uploads novos de RDO/RNC eram gravados em diretorio plano.

## Riscos restantes

- Mensagens, notificacoes e Socket.IO precisam de teste automatizado dedicado para garantir ausencia de evento cruzado entre tenants.
- Compras, almoxarifado, email e avatar ainda devem passar por varredura especifica de uploads por tenant.
- Arquivos historicos sem prefixo `tenant_<id>/` ainda dependem de compatibilidade autenticada e devem ser migrados fisicamente para pastas tenant.
- `frontend/src/pages/RDOForm.jsx.backup` contem referencias antigas de backup e deve ser removido ou atualizado em limpeza propria.

## Versionamento

Commit: pendente ate conclusao dos testes finais.

Pull Request: pendente ate push da branch.

Deploy: nao executado.

# Diagnostico do incidente de dados - Vetor

## Status atual do incidente

**Reanálise em 2026-07-15 (America/Sao_Paulo).** Branch `main`, commit `e3d9cc289c0121bc4a69c8d2eb7b3bff1879f65d` (`feat: adicionar cockpit da obra`, 2026-07-15 21:22:19 -03:00).

**Status:** as causas de recorrência identificadas em 2026-06-12 foram **corrigidas no código e na configuração atuais**: o deploy não aceita mais `APP_DATA_DIR` implícito, produção não inicializa um banco ausente, o acesso não copia/apaga/recria tenant DB, tenants novos são provisionados a partir de schema limpo e validados antes da ativação, migrations estão versionadas, e o pipeline cria backup antes de aplicá-las. O vínculo local de `UFV MESQUITA 1`, ausente no incidente, também existe hoje.

Isso não equivale a confirmar uma restauração no ambiente de produção. Nesta reanálise não houve acesso ao host, Docker, banco ou backups de produção. Portanto:

- **correção preventiva em código/configuração:** confirmada;
- **dados locais e vínculo antes ausente:** confirmados;
- **recuperação dos dados no host de produção e operação do backup/restore:** **não foi possível validar**.

O relato iniciado em 2026-06-12, incluindo evidências, datas, contagens, causa confirmada e verificações no servidor, é preservado integralmente a partir da seção “Registro histórico do incidente”. As conclusões abaixo descrevem apenas correções posteriores e estado atual; não reescrevem o que foi observado na data do incidente.

### Estado na data do incidente — 2026-06-12

Conforme a investigação histórica preservada abaixo:

- a produção montava `/home/ubuntu/app_data/gestao-obras-vetor/database` em `/app/database` por fallback do Compose;
- o DB principal e `tenant_2.db` montados no servidor estavam novos/incompletos e sem projetos, RDOs, EAP, RNCs ou anexos esperados;
- o startup executou `initDatabase.js` e a migração de multitenancy, criando tabelas/usuário padrão no caminho montado;
- `APP_DATA_DIR` não estava definido no container ou `.env` verificado;
- não foram encontrados backups SQLite no servidor consultado;
- no workspace local havia dados em `tenant_1.db`; `UFV MESQUITA 1` existia, mas tinha zero vínculos em `projeto_usuarios`;
- a causa confirmada não era apenas RBAC: o container apontava para um banco que não continha os dados esperados.

### Correções posteriores encontradas no repositório

1. **Volume e diretório de dados**
   - `docker-compose.yml` exige `APP_DATA_DIR` com `${APP_DATA_DIR:?...}`; o fallback silencioso foi removido.
   - `.github/workflows/deploy.yml` exporta explicitamente `/home/ubuntu/app_data/gestao-obras-vetor`.
   - `scripts/validate_data_dir.sh` aceita somente esse caminho e exige `database`, `uploads` e `gestao_obras.db` existentes, acessíveis e não ausentes.

2. **Startup fail-safe**
   - `backend/config/database.js` não cria diretórios nem banco principal em produção e exige principal/tenants existentes.
   - `ensureTenantDatabase()` falha se `tenant_<id>.db` estiver ausente ou tiver metadados divergentes; não copia mais o banco principal e não apaga/recria o tenant DB.
   - `backend/scripts/validateStartupDatabase.js` abre os arquivos em modo somente leitura, verifica tabelas/metadados mínimos e bloqueia DB inválido; tenant ativo sem arquivo é explicitamente reportado.
   - `backend/server.js` executa status de migrations e aborta antes de ouvir se houver pendência/schema inválido; as antigas mutações dispersas de startup foram removidas/centralizadas.

3. **Provisionamento e isolamento multitenant**
   - `backend/services/tenantProvisioning.js` cria tenant DB de schema limpo, aplica migrations, copia apenas metadados essenciais, executa `integrity_check`/`foreign_key_check` e ativa o tenant somente depois da validação.
   - Arquivo tenant preexistente causa `TENANT_DATABASE_ALREADY_EXISTS`, sem sobrescrita.
   - Registro/login/cancelamento foram integrados ao fluxo seguro; cancelamento não remove fisicamente o arquivo tenant.
   - `npm run test:tenant` valida dois tenants temporários e confirma que um não enxerga o projeto do outro.

4. **Migrations**
   - Há runner central e tabela `schema_migrations`; produção exige `MIGRATIONS_ALLOW_PRODUCTION=true` para escrita.
   - O repositório atual contém 10 migrations (`000001`–`000010`). Os quatro DBs locais registram 11 porque preservam o registro histórico `000011_relatorios_semanais`, cujo arquivo/módulo foi removido.
   - O workflow verifica pendências, aplica pelo runner, verifica novamente e executa integridade/FKs antes de subir.

5. **Backup e deploy**
   - O workflow aborta em branch errada ou worktree sujo, valida JWT/Compose/diretório/DB, constrói antes de parar o backend e cria backup pré-deploy.
   - `backupDatabase.js` copia recursivamente todo `database` (principal e tenants) e `uploads`, com manifesto.
   - O deploy tenta religar o backend anterior se falhar depois da parada e só conclui após health check.
   - `server-setup.sh` passou a usar o caminho oficial, mas sua rotina diária simples ainda copia apenas o DB principal; não substitui o backup completo do deploy.

6. **Arquivos e uploads**
   - `/uploads` público foi removido; `/api/uploads/*` exige autenticação.
   - Novos uploads são separados por `tenant_<id>`; arquivos históricos planos continuam em modo de compatibilidade autenticada.

7. **Vínculos e exclusões**
   - No `tenant_1.db` local atual, `UFV MESQUITA 1` está ativo e possui 1 vínculo, contra zero em 2026-06-12.
   - A exclusão de projeto foi desabilitada (`DELETE /api/projetos/:id` retorna 405) e o fluxo suportado é arquivamento.
   - A criação ainda só adiciona os IDs enviados em `usuarios`; não há garantia explícita de autovínculo do criador. Para perfil não global, esse risco de recorrência de vínculo é apenas parcialmente resolvido.

### Estado atual validado em modo somente leitura

Os bancos locais foram abertos com SQLite `OPEN_READONLY`; nenhum dado/schema foi alterado.

| Banco local | Tamanho | Tabelas | Projetos | RDOs | EAP | RNC | Anexos | Migrations | `integrity_check` | Violações FK |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|
| `gestao_obras.db` | 86.450.176 B | 60 | 1 | 2 | 8 | 2 | 3 | 11 | `ok` | 28 |
| `tenants/tenant_1.db` | 991.232 B | 60 | 3 | 6 | 76 | 3 | 13 | 11 | `ok` | 253 |
| `tenants/tenant_3.db` | 1.126.400 B | 60 | 3 | 7 | 268 | 1 | 10 | 11 | `ok` | 0 |
| `tenants/tenant_4.db` | 622.592 B | 60 | 1 | 0 | 0 | 0 | 0 | 11 | `ok` | 0 |

Estado dos vínculos locais relevantes:

- `tenant_1.db`: `UFV IPATINGA l` com 3 vínculos; `UFV MESQUITA 1` com 1; um projeto de smoke test com 1.
- `tenant_3.db`: três projetos, todos vinculados (um arquivado).
- `tenant_4.db`: um projeto com 1 vínculo.

As violações FK no principal/tenant 1 permanecem majoritariamente ligadas a referências legadas a `rdos_old`; no tenant 1 também há `usuario_tenants` órfãos já descritos no histórico. Integridade física `ok` não elimina violações relacionais.

### Banco, volumes, migrations, backup, restauração e deploy — situação atual

| Tema | Estado atual | Classificação |
|---|---|---|
| Caminho oficial/Compose | `APP_DATA_DIR` obrigatório e fixado/validado pelo workflow | Resolvido no código/configuração |
| Mount real de produção atual | Não houve `docker inspect` nesta reanálise | Não foi possível validar |
| Banco local | Dados presentes; quatro DBs ativos; integridade física `ok` | Validado localmente |
| Banco de produção restaurado | Sem acesso ao host/DB atual | Não foi possível validar |
| Migrations | Runner central; 10 arquivos atuais; 11 registros locais por resíduo histórico removido | Parcialmente resolvido |
| Startup | Não inicializa/copia/recria DB em produção; valida antes de servir | Resolvido |
| Multitenancy | Provisionamento seguro e teste básico de isolamento | Parcialmente resolvido |
| Vínculo de `UFV MESQUITA 1` | 1 vínculo no DB local atual | Resolvido localmente |
| Órfãos/FKs legadas | 28 e 253 violações nos DBs principal/tenant 1 | Ainda presente |
| Backup pré-deploy | Bancos + tenants + uploads + manifesto | Resolvido no pipeline |
| Backup diário | Caminho corrigido, mas cópia simples não cobre o conjunto completo | Parcialmente resolvido |
| Restauração | Sem comando/runbook automatizado nem teste executado nesta tarefa | Ainda presente |
| Deploy | Guardas, backup, migrations, integrity/FK e health check implementados | Resolvido no pipeline; execução atual não validada |

### Classificação dos riscos registrados em 2026-06-12

| Risco anterior | Classificação atual | Evidência/observação |
|---|---|---|
| Restart executar `initDatabase.js` e `migrate_multitenancy.js` em produção | Resolvido | O branch de produção do entrypoint não chama esses scripts. |
| Startup aplicar migrations/ALTER dispersos | Parcialmente resolvido | Runner central e guard existem, mas `entrypoint.sh` ainda chama migrations autorizadas em produção; há código lazy legado bloqueado/condicionado. |
| `ensureTenantDatabase()` copiar principal se tenant não existir | Resolvido | Agora falha com banco ausente. |
| `ensureTenantDatabase()` apagar/recriar DB divergente | Resolvido | Agora falha com divergência; teste bloqueia sobrescrita. |
| Compose selecionar outro diretório por `APP_DATA_DIR` ausente/diferente | Resolvido | Variável obrigatória e validador aceita somente o caminho oficial. Mount real atual não foi consultado. |
| Workflow usar `git reset --hard` | Ainda presente | Continua no deploy, mitigado por branch/worktree limpos e backup de dados posterior. |
| Backup automático apontar para caminho antigo | Resolvido quanto ao caminho | `server-setup.sh` usa o caminho oficial. |
| Backup não cobrir tenants/uploads | Parcialmente resolvido | Pré-deploy cobre tudo; cron simples ainda não. |
| Ausência de backup SQLite no servidor observado | Não foi possível validar | O pipeline agora cria backups, mas não houve inspeção do host atual. |
| Ausência de restore validado | Ainda presente | Nenhum teste de restauração foi executado/encontrado. |
| Projeto ativo sem `projeto_usuarios` | Parcialmente resolvido | Caso `UFV MESQUITA 1` está corrigido localmente; criação ainda pode receber lista vazia e não autovincular criador. |
| Dados do tenant existirem em DB diferente do montado | Resolvido preventivamente | Guardas impedem DB ausente/inválido e caminho implícito; conteúdo efetivo de produção não foi validado. |
| Tenant DB novo/incompleto ser aceito | Parcialmente resolvido | Tabelas/metadados/migrations são validados, mas o guard não exige contagens operacionais mínimas — um tenant legitimamente vazio e um esvaziado podem ser indistinguíveis. |
| Violações de integridade/FKs legadas | Ainda presente | `foreign_key_check`: 28 no principal e 253 no tenant 1. |
| Uploads fora de isolamento/autorização | Parcialmente resolvido | Novos uploads isolados e rota autenticada; históricos planos ainda dependem de compatibilidade. |

### Verificações executadas nesta reanálise

- `npm run test:tenant`: **sucesso** em DBs temporários; nenhum DB real alterado.
- `npm run test:cockpit`: **sucesso**, 14 cenários.
- `npm run build` no frontend: **sucesso**, com avisos de bundle grande e import misto de `api.js`.
- Lint: **não executado**, pois não existe script/configuração de lint nos packages.
- Bancos locais: somente leitura, `integrity_check` e `foreign_key_check`.

### Limitações atuais

- Nenhum acesso a produção, Docker, GitHub Actions executado, provedor, snapshots ou storage externo.
- Nenhuma confirmação de que o commit atual está implantado.
- Nenhum backup foi restaurado; recuperabilidade não foi demonstrada.
- Os arquivos locais de banco são evidência do workspace, não prova do banco atualmente montado em produção.
- O worktree já tinha alterações de código/logs anteriores à tarefa; elas foram lidas, preservadas e não são correções feitas nesta análise.

## Registro histórico do incidente — investigação iniciada em 2026-06-12

> As seções seguintes são preservadas como registro histórico. Expressões como “atualmente”, “produção” e commits nelas referem-se à data de cada verificação original, não ao estado de 2026-07-15.

Data da investigacao: 2026-06-12  
Escopo executado: leitura local do repositorio, arquivos de configuracao, logs locais e bancos SQLite encontrados no workspace.

## 1. Resumo do incidente

Durante o uso em producao, apareceu uma mensagem semelhante a "projeto nao pertence ao usuario/tenant" e, em seguida, projetos e dados desapareceram da interface.

O achado principal desta investigacao e que os dados nao parecem ter sido zerados. Ha dados recentes no banco de tenant `tenant_1.db`, inclusive atividade em 2026-06-11 e 2026-06-12. O comportamento mais compativel com a evidencia local e uma combinacao de:

- uso de banco/diretorio diferente entre banco principal e banco tenant;
- projeto ativo sem vinculo em `projeto_usuarios`;
- deploy/restart que pode apontar para outro `APP_DATA_DIR` ou recriar banco tenant a partir do banco principal;
- migrations automaticas no startup, que tornam reinicios arriscados enquanto o caminho correto do volume nao estiver confirmado.

## 2. Ambiente em execucao

Nao foi possivel confirmar containers ativos, imagens, mounts reais e variaveis do container nesta sessao, porque o comando `docker` nao esta disponivel no ambiente do Codex:

```text
docker: termo nao reconhecido como cmdlet/programa
```

O que foi confirmado por arquivos:

- Projeto local: `C:\Apps\Vetor - Gerencia\gestao-obras-vetor`
- Branch local: `main`
- Commit local atual: `d74bbf1a7b400e44c51adc639feadd5071c28a5e`
- Ultimo commit local: `d74bbf1 2026-06-12 12:23:30 -0300 Enforce photo activity links and refine RDO PDF layout`
- Compose: `gestao-obras-vetor/docker-compose.yml`
- Containers esperados pelo compose: `gestao-backend`, `gestao-frontend`
- Montagens configuradas:
  - `${APP_DATA_DIR:-/home/ubuntu/app_data/gestao-obras-vetor}/uploads:/app/uploads`
  - `${APP_DATA_DIR:-/home/ubuntu/app_data/gestao-obras-vetor}/database:/app/database`
- `.env` local do backend, com secrets omitidos:
  - `PORT=3001`
  - `NODE_ENV=development`
  - `DATABASE_PATH=./database/gestao_obras.db`
  - `UPLOADS_PATH=./uploads`
  - `JWT_SECRET=<redacted>`

Observacao importante: `DATABASE_PATH` e `UPLOADS_PATH` aparecem no `.env`, mas `backend/config/database.js` nao usa `DATABASE_PATH`. O caminho do banco e fixo por codigo: `backend/database/gestao_obras.db` dentro da aplicacao, que em container equivale a `/app/database/gestao_obras.db`.

## 3. Banco usado atualmente pelo codigo

Pelo codigo:

- Banco principal: `/app/database/gestao_obras.db`
- Diretorio de tenants: `/app/database/tenants`
- Banco do tenant 1: `/app/database/tenants/tenant_1.db`

Pelo compose, esses caminhos sao montados a partir do host:

- Banco principal esperado no host: `${APP_DATA_DIR:-/home/ubuntu/app_data/gestao-obras-vetor}/database/gestao_obras.db`
- Banco tenant esperado no host: `${APP_DATA_DIR:-/home/ubuntu/app_data/gestao-obras-vetor}/database/tenants/tenant_1.db`
- Uploads esperados no host: `${APP_DATA_DIR:-/home/ubuntu/app_data/gestao-obras-vetor}/uploads`

Nao foi possivel confirmar se o container de producao esta de fato usando esse caminho, porque faltou acesso a `docker inspect`, `docker compose config` e variaveis reais do container.

## 4. Todos os bancos encontrados

Foram encontrados dois bancos SQLite no workspace:

| Banco | Tamanho | Criado em | Modificado em | Tabelas |
|---|---:|---|---|---:|
| `backend/database/gestao_obras.db` | 44.969.984 bytes | 2026-03-30 15:00:13 | 2026-06-12 12:15:24 | 44 |
| `backend/database/tenants/tenant_1.db` | 790.528 bytes | 2026-03-31 23:50:17 | 2026-06-12 12:23:36 | 44 |

## 5. Contagem de registros por banco

| Tabela | `gestao_obras.db` | `tenant_1.db` |
|---|---:|---:|
| `usuarios` | 2 | 2 |
| `tenants` | 1 | 1 |
| `usuario_tenants` | 2 | 8 |
| `projetos` | 1 | 2 |
| `projeto_usuarios` | 2 | 2 |
| `rdos` | 2 | 6 |
| `atividades_eap` | 8 | 76 |
| `rnc` | 2 | 3 |
| `requisicoes` | 4 | 4 |
| `pedidos_compra` | 0 | 0 |
| `anexos` | 1 | 13 |
| `auditoria` | 33 | 235 |

Conclusao: o banco tenant tem mais projetos, RDOs, EAPs, anexos e auditoria. Portanto ha dados existentes no tenant DB que nao aparecem com a mesma quantidade no banco principal.

## 6. Tenant do usuario

Usuarios confirmados nos dois bancos:

| ID | Login | Nome | Perfil | tenant_id | is_adm | is_gestor | ativo |
|---:|---|---|---|---:|---:|---:|---:|
| 1 | `000001` | Ihiago Arruda | Gestor Geral | 1 | 0 | 1 | 1 |
| 2 | `000002` | PAOLLA CRISTINA | ADM | 1 | 1 | 0 | 1 |

Tenant confirmado:

| ID | Nome | Slug | Ativo | Criado em |
|---:|---|---|---:|---|
| 1 | Tenant Padrao | tenant-padrao | 1 | 2026-03-30 19:05:33 |

Vinculos `usuario_tenants`:

- `gestao_obras.db`: usuarios 1 e 2 vinculados ao tenant 1, ativos.
- `tenant_1.db`: usuarios 1 e 2 vinculados ao tenant 1, ativos; tambem existem vinculos orfaos para usuarios 5, 6, 7, 8, 9 e 10, mas esses usuarios nao existem mais na tabela `usuarios` do tenant DB.

Nao foi possivel confirmar token JWT usado no incidente, porque nenhum token/login do usuario afetado foi fornecido. Com a evidencia local, os usuarios 1 e 2 estao no tenant correto.

## 7. Vinculos com projetos

Projetos no `gestao_obras.db`:

| ID | Nome | tenant_id | Ativo | Arquivado | Vinculos |
|---:|---|---:|---:|---:|---:|
| 1 | UFV IPATINGA l | 1 | 1 | 0 | 2 |

Projetos no `tenant_1.db`:

| ID | Nome | tenant_id | Ativo | Arquivado | Vinculos |
|---:|---|---:|---:|---:|---:|
| 1 | UFV IPATINGA l | 1 | 1 | 0 | 2 |
| 2 | UFV MESQUITA 1 | 1 | 1 | 0 | 0 |

Achado critico: `UFV MESQUITA 1` existe, esta ativo, pertence ao tenant 1, mas nao tem nenhum registro em `projeto_usuarios`.

Pelo codigo de `backend/routes/projetos.js`:

- ADM e Gestor Geral veem todos os projetos ativos do tenant.
- Outros perfis so veem projetos quando existe registro em `projeto_usuarios`.
- A rota de detalhe retorna erro se o projeto nao pertence ao tenant ou, para perfis nao globais, se o usuario nao tiver vinculo.

Logo, para usuario sem perfil ADM/Gestor Geral, o projeto 2 tende a sumir da listagem e pode gerar erro de acesso.

## 8. Estado dos projetos

Estado confirmado:

- Nenhum projeto encontrado como arquivado.
- Nenhum projeto encontrado como inativo.
- O projeto 2 existe apenas no banco tenant, nao no banco principal.
- O projeto 2 nao tem vinculos em `projeto_usuarios`.

## 9. Volumes montados e diretorios

Configuracao esperada pelo compose:

```yaml
volumes:
  - ${APP_DATA_DIR:-/home/ubuntu/app_data/gestao-obras-vetor}/uploads:/app/uploads
  - ${APP_DATA_DIR:-/home/ubuntu/app_data/gestao-obras-vetor}/database:/app/database
```

No `.env` local do backend nao ha `APP_DATA_DIR`. Se `APP_DATA_DIR` tambem nao estiver definido no ambiente em que `docker compose` roda no servidor, o compose usa o padrao `/home/ubuntu/app_data/gestao-obras-vetor`.

Risco: o script antigo de setup do servidor cria backup a partir de `/home/ubuntu/app/gestao-obras-vetor/backend/database/gestao_obras.db`, enquanto o compose atual usa `/home/ubuntu/app_data/gestao-obras-vetor/database`. Isso indica possibilidade de diretorios antigos/novos coexistirem.

## 10. Alteracoes recentes

Commits recentes:

- `d74bbf1` 2026-06-12 12:23:30 - Enforce photo activity links and refine RDO PDF layout
- `7f03a14` 2026-06-11 21:11:50 - Keep RDO signatures attached to the last table
- `0c18678` 2026-06-11 21:04:51 - Fix RDO photo removal and PDF layout
- `4726db4` 2026-06-11 20:53:03 - Polish RDO file upload and signature page layout
- `74b364f` 2026-06-11 20:45:18 - Harden RDO photo uploads for deploy schema mismatches
- `0d81d51` 2026-06-11 20:34:37 - Expand RDO attachments and tighten messaging limits
- `1a67ba2` 2026-06-11 10:45:09 - Add automatic RDO correction alerts on EAP recalculation
- `b5a4df7` 2026-06-11 09:54:37 - Fix per-project RDO numbering and constraints
- `2524091` 2026-06-11 02:01:32 - feat: adiciona importacao de EAP por Excel
- `67697d7` 2026-06-10 20:24:24 - Configura deploy automatico via GitHub Actions

Alteracao historica relevante em volumes:

- Commit `d0d6092` de 2026-04-01 trocou os mounts de:
  - `./backend/uploads:/app/uploads`
  - `./backend/database:/app/database`
- Para:
  - `${APP_DATA_DIR:-/home/ubuntu/app_data/gestao-obras-vetor}/uploads:/app/uploads`
  - `${APP_DATA_DIR:-/home/ubuntu/app_data/gestao-obras-vetor}/database:/app/database`

Workflow atual de deploy:

- executa `git reset --hard origin/$TARGET_BRANCH`;
- reescreve `backend/.env` com o secret `BACKEND_ENV`;
- executa `sudo docker compose up -d --build ...` quando backend/frontend mudaram;
- executa `sudo docker compose up -d backend frontend` quando nao houve mudanca relevante;
- nao define explicitamente `APP_DATA_DIR` no workflow.

## 11. Logs relevantes

Logs locais encontrados:

- `logs/backend-out.log`
- `logs/backend.log`
- `backend/server.log`
- `logs/smtp.log`
- outros logs de frontend/backend vazios ou antigos

Trechos relevantes:

```text
[migrate_add_requisicoes] Iniciando migracao...
[migrate_add_cotacao_fields] Iniciando...
Servidor inicializado na porta 3001
Conectado ao banco de dados SQLite (principal)
[migrate_add_cotacao_fields] Schema ja compativel.
[migrate_add_requisicoes] Migracao concluida com sucesso.
EAP recalculada com sucesso.
```

Nao foram encontrados nos logs locais:

- `SQLITE_CANTOPEN`
- `SQLITE_BUSY`
- erro literal "projeto nao pertence ao usuario"
- 401/403/500 relevantes
- criacao explicita de banco novo no log local

Limitacao: logs reais do Docker/Nginx/GitHub Actions no servidor nao foram consultados nesta sessao.

## 12. Hipotese mais provavel

A hipotese mais provavel, com base somente na evidencia local, e:

1. Os dados principais de operacao estao em `backend/database/tenants/tenant_1.db`.
2. O banco principal `gestao_obras.db` tem menos dados e nao contem o projeto 2.
3. O projeto `UFV MESQUITA 1` existe no tenant DB, esta ativo, mas esta sem vinculos em `projeto_usuarios`.
4. Se o usuario afetado nao for ADM/Gestor Geral, a listagem de projetos usa `INNER JOIN projeto_usuarios` e esse projeto desaparece.
5. Se o container/deploy passou a usar outro diretorio por causa de `APP_DATA_DIR`, ou se `tenant_1.db` foi recriado a partir do banco principal, a interface pode parecer "zerada" ou incompleta.

Essa hipotese explica tanto a mensagem de acesso quanto a impressao de perda de dados, sem exigir apagamento real.

## 13. Confirmacao se os dados ainda existem

Sim, os dados ainda existem no banco tenant encontrado localmente:

- 2 projetos em `tenant_1.db`;
- 6 RDOs;
- 76 atividades EAP;
- 3 RNCs;
- 4 requisicoes;
- 13 anexos;
- 235 registros de auditoria;
- auditoria recente em 2026-06-11 e 2026-06-12.

O projeto `UFV MESQUITA 1` existe em `tenant_1.db`, mas nao possui vinculo de usuario.

## 14. Backups

No workspace local, nao foram encontrados backups de banco alem dos bancos ativos. Foi encontrado apenas:

- `frontend/src/pages/RDOForm.jsx.backup`

O script `scripts/server-setup.sh` cria um backup diario em `/home/ubuntu/backups`, mas aponta para:

```text
/home/ubuntu/app/gestao-obras-vetor/backend/database/gestao_obras.db
```

Esse caminho pode estar desatualizado em relacao ao compose atual, que usa `/home/ubuntu/app_data/gestao-obras-vetor/database`.

Antes de qualquer recuperacao, localizar no servidor:

- `/home/ubuntu/backups`
- `/home/ubuntu/backup.log`
- `/home/ubuntu/app/gestao-obras-vetor/backend/database`
- `/home/ubuntu/app_data/gestao-obras-vetor/database`
- qualquer diretorio antigo de deploy

Nao restaurar nada ainda.

## 15. Plano seguro de recuperacao

Nao executar ainda. Ordem segura proposta:

1. No servidor, confirmar caminho real do volume com `docker inspect gestao-backend` e `docker compose config`, apenas leitura.
2. Confirmar se `/app/database/tenants/tenant_1.db` dentro do container corresponde ao banco com 2 projetos/6 RDOs/76 EAPs.
3. Fazer copia fria dos arquivos SQLite e uploads antes de qualquer ajuste.
4. Confirmar qual usuario teve o incidente e qual token/tenant estava ativo.
5. Se o problema for apenas vinculo, corrigir `projeto_usuarios` do projeto 2 somente apos autorizacao e backup.
6. Se o problema for volume errado, parar para planejar troca controlada de volume/`APP_DATA_DIR`, com backup e janela de manutencao.
7. Se o problema for tenant DB recriado, restaurar/corrigir a partir do banco tenant correto ou backup validado, nunca sobrepor sem copia.

## 16. Riscos

- Reiniciar container pode executar `entrypoint.sh`, que roda `initDatabase.js` e `migrate_multitenancy.js`.
- `server.js` tambem executa migrations/ALTER TABLE no startup.
- `ensureTenantDatabase()` pode copiar o banco principal para `tenant_1.db` se o arquivo tenant nao existir.
- `ensureTenantDatabase()` tambem pode remover e recriar o banco tenant se considerar metadados de tenant divergentes.
- `docker compose` pode usar outro diretorio se `APP_DATA_DIR` estiver ausente ou diferente.
- O workflow de deploy executa `git reset --hard` no servidor.
- O backup automatico documentado pode estar apontando para caminho antigo, nao para o volume atual.

## 17. Comandos que NAO devem ser executados agora

Nao executar sem autorizacao explicita:

- `docker compose down -v`
- `docker volume rm`
- `rm -rf` em banco, uploads, volumes ou backups
- migrations manuais
- `npm run prisma:*`
- `node scripts/setupDatabase.js`
- `node scripts/initDatabase.js`
- `node scripts/migrate_multitenancy.js`
- restart de container
- deploy
- restore de backup
- alteracao de `.env`
- troca de `APP_DATA_DIR`
- qualquer `INSERT`, `UPDATE`, `DELETE`, `ALTER`, `DROP` no banco

## 18. Proximas verificacoes de leitura no servidor

Executar somente se autorizado e no host correto:

```bash
docker ps
docker inspect gestao-backend
docker compose ps
docker compose config
docker exec gestao-backend sh -lc 'pwd; ls -lah /app/database /app/database/tenants /app/uploads; printenv | grep -E "APP_DATA_DIR|NODE_ENV|PORT|DATABASE|UPLOAD"'
sudo find /home/ubuntu -type f \( -name "*.db" -o -name "*.sqlite" -o -name "*.sqlite3" \) -printf "%p %s %TY-%Tm-%Td %TH:%TM:%TS\n"
sudo ls -lah /home/ubuntu/backups /home/ubuntu/app_data/gestao-obras-vetor/database /home/ubuntu/app/gestao-obras-vetor/backend/database
docker logs --tail 300 gestao-backend
```

Esses comandos sao de leitura, mas ainda assim devem ser rodados com cuidado no servidor correto.

## 19. Verificacao direta no servidor de producao

Data/hora da verificacao no servidor: 2026-06-12 23:50:50 +02:00  
Host acessado: `161.97.136.203`  
Usuario SSH: `root`  
Hostname: `vmi2025831`  
Diretorio inicial SSH: `/root`  
Diretorio real da aplicacao: `/root/Vetor---Gerencia/gestao-obras-vetor`

### 19.1 Container ativo

Containers ativos:

| Container | Imagem | Status | Portas |
|---|---|---|---|
| `gestao-backend` | `gestao-obras-vetor-backend` | `Up 6 hours` | `3001/tcp` |
| `gestao-frontend` | `gestao-obras-vetor-frontend` | `Up 6 hours` | `0.0.0.0:80->80/tcp` |

Backend:

- Container ID: `138d07ea07ece1f9f9c2659fe765f79ee54a98e6978cbe4f7978f2985275fa3f`
- Image ID: `sha256:ad2178b0ea7df646a0646475bdfd1854b7a80b20b9b132aa3a888bb8dc98affd`
- Criado em: `2026-06-12T15:24:25.509825838Z`
- Iniciado em: `2026-06-12T15:24:36.40334724Z`
- Status: `running`

Commit em producao:

```text
d74bbf1a7b400e44c51adc639feadd5071c28a5e
d74bbf1 2026-06-12 12:23:30 -0300 Enforce photo activity links and refine RDO PDF layout
```

### 19.2 Mounts reais e APP_DATA_DIR

Mounts reais do container `gestao-backend`:

| Origem no host | Destino no container | Tipo | RW |
|---|---|---|---|
| `/home/ubuntu/app_data/gestao-obras-vetor/uploads` | `/app/uploads` | bind | true |
| `/home/ubuntu/app_data/gestao-obras-vetor/database` | `/app/database` | bind | true |

Variaveis filtradas do container:

```text
NODE_ENV=production
TZ=America/Sao_Paulo
PORT=3001
```

`APP_DATA_DIR` nao aparece no ambiente do container. No `backend/.env` do servidor, com valores redigidos, foram encontrados apenas:

```text
PORT=<redacted>
NODE_ENV=<redacted>
```

Conclusao: o compose esta usando o fallback padrao do arquivo `docker-compose.yml`:

```text
/home/ubuntu/app_data/gestao-obras-vetor
```

### 19.3 Banco realmente usado

Banco principal realmente montado no container:

```text
/app/database/gestao_obras.db
```

Arquivo correspondente no host:

```text
/home/ubuntu/app_data/gestao-obras-vetor/database/gestao_obras.db
```

Banco tenant existente no container:

```text
/app/database/tenants/tenant_2.db
```

Arquivo correspondente no host:

```text
/home/ubuntu/app_data/gestao-obras-vetor/database/tenants/tenant_2.db
```

Importante: nao existe `/app/database/tenants/tenant_1.db` no servidor de producao verificado. O tenant ativo com usuarios da Vetor no banco de producao e o tenant `2`.

Arquivos SQLite encontrados em `/home/ubuntu`:

| Caminho | Tamanho | Modificacao |
|---|---:|---|
| `/home/ubuntu/app_data/gestao-obras-vetor/database/gestao_obras.db` | 319.488 bytes | 2026-06-12 17:24:40 |
| `/home/ubuntu/app_data/gestao-obras-vetor/database/tenants/tenant_2.db` | 327.680 bytes | 2026-06-12 23:17:12 |

Nao foram encontrados arquivos `.db`, `.sqlite` ou `.sqlite3` em `/root`.

### 19.4 Contagens do banco de producao

Banco principal `/home/ubuntu/app_data/gestao-obras-vetor/database/gestao_obras.db`:

| Tabela | Registros |
|---|---:|
| `usuarios` | 5 |
| `tenants` | 3 |
| `usuario_tenants` | 5 |
| `projetos` | 0 |
| `projeto_usuarios` | 0 |
| `rdos` | 0 |
| `atividades_eap` | 0 |
| `rnc` | 0 |
| `anexos` | 0 |
| `requisicoes` | 0 |
| `auditoria` | 0 |

Banco tenant `/home/ubuntu/app_data/gestao-obras-vetor/database/tenants/tenant_2.db`:

| Tabela | Registros |
|---|---:|
| `usuarios` | 3 |
| `tenants` | 3 |
| `usuario_tenants` | 3 |
| `projetos` | 0 |
| `projeto_usuarios` | 0 |
| `rdos` | 0 |
| `atividades_eap` | 0 |
| `rnc` | 0 |
| `anexos` | 0 |
| `requisicoes` | 0 |
| `auditoria` | 0 |

### 19.5 Tenants e usuarios encontrados

Tenants no banco principal:

| ID | Nome | Slug | Ativo | Criado em |
|---:|---|---|---:|---|
| 1 | Tenant Padrao | `tenant-padrao` | 1 | 2026-06-04 19:21:42 |
| 2 | Vetor Engenhharia | `vetor-engenhharia-vaw35` | 1 | 2026-06-04 19:44:49 |
| 3 | UTFPR - Pato Branco | `utfpr-pato-branco-yot1a` | 1 | 2026-06-11 21:33:06 |

Usuarios no banco principal:

| ID | Nome | Login | Perfil | tenant_id | Ativo | is_adm | is_gestor |
|---:|---|---|---|---:|---:|---:|---:|
| 1 | Administrador | `000001` | Gestor Geral | 1 | 1 | 1 | 1 |
| 3 | Ihiago Arruda | `ihiagoarruda7619` | Gestor Geral | 2 | 1 | 0 | 1 |
| 8 | Paolla Cristina | `paollacristina1035` | ADM | 2 | 1 | 1 | 0 |
| 11 | Lucas Silva | `lucassilva0580` | Gestor Geral | 3 | 1 | 0 | 1 |
| 12 | Lucas | `lucas4079` | ADM | 2 | 1 | 1 | 0 |

Usuarios no banco tenant 2:

| ID | Nome | Login | Perfil | tenant_id | Ativo | is_adm | is_gestor |
|---:|---|---|---|---:|---:|---:|---:|
| 3 | Ihiago Arruda | `ihiagoarruda7619` | Gestor Geral | 2 | 1 | 0 | 1 |
| 8 | Paolla Cristina | `paollacristina1035` | ADM | 2 | 1 | 1 | 0 |
| 12 | Lucas | `lucas4079` | ADM | 2 | 1 | 1 | 0 |

### 19.6 Projetos, vinculos, RDOs e dados do tenant

No banco principal e no banco tenant 2:

- `UFV IPATINGA l`: nao encontrado.
- `UFV MESQUITA 1`: nao encontrado.
- `projetos`: 0 registros.
- `projeto_usuarios`: 0 registros.
- `rdos`: 0 registros.
- `atividades_eap`: 0 registros.
- `rnc`: 0 registros.
- `anexos`: 0 registros.

Conclusao: a producao acessada nao contem os projetos e RDOs esperados no banco atualmente montado.

### 19.7 Logs relevantes do backend

Os logs do container mostram que, ao iniciar, o backend criou/inicializou tabelas e usuario padrao:

```text
>>> Inicializando banco de dados...
Iniciando criacao das tabelas...
Conectado ao banco de dados SQLite (principal)
Tabela usuarios criada
Tabela projetos criada
Tabela projeto_usuarios criada
Tabela atividades_eap criada
Tabela rdos criada
Tabela anexos criada
Tabela rnc criada
Tabela auditoria criada
Usuario administrador criado (Login: 000001, Senha: 123456)
Banco de dados inicializado com sucesso!
>>> Aplicando migracao de multitenancy...
>>> Iniciando servidor...
```

Tambem aparecem erros de schema/tabelas ausentes, compativeis com banco novo ou incompleto:

```text
SQLITE_ERROR: no such table: rdo_fotos
SQLITE_ERROR: no such table: rdo_materiais
SQLITE_ERROR: no such table: rdo_mao_obra
SQLITE_ERROR: no such table: mensagem_recibos
SQLITE_ERROR: no such table: almox_ferramentas
SQLITE_BUSY: database is locked
```

O log de startup tambem mostra:

```text
[migrate_rdo_numero_por_projeto] gestao_obras.db: ok
[migrate_rdo_numero_por_projeto] tenants/tenant_2.db: ok
```

Nao foi encontrado, nos logs consultados, um registro literal de `APP_DATA_DIR`, nem mensagem literal de `UFV MESQUITA 1`.

### 19.8 Backups existentes no servidor

Foram localizados apenas:

| Caminho | Tamanho | Modificacao | Observacao |
|---|---:|---|---|
| `/root/deploy-backups/package-lock.server-backup.json` | 97 bytes | 2026-06-04 21:08:26 | nao e backup de banco |
| `/root/Vetor---Gerencia/gestao-obras-vetor/frontend/src/pages/RDOForm.jsx.backup` | 62.001 bytes | 2026-06-04 21:06:57 | backup de arquivo frontend, nao banco |

Nao foi encontrado backup SQLite em `/home/ubuntu/backups` nem em `/root/deploy-backups`.

Uploads existentes:

- Diretorio ativo: `/home/ubuntu/app_data/gestao-obras-vetor/uploads`
- Contem arquivos enviados entre 2026-06-11 e 2026-06-12.
- Nao foi encontrado pacote de backup contendo uploads.

### 19.9 Causa confirmada

Causa confirmada pela verificacao no servidor:

O container de producao esta usando o bind mount `/home/ubuntu/app_data/gestao-obras-vetor/database` como `/app/database`, e esse diretorio contem um banco SQLite novo/incompleto, sem projetos, RDOs, EAP, RNCs, anexos ou auditoria.

`APP_DATA_DIR` nao esta definido no ambiente do container nem aparece no `.env` do servidor. Assim, o compose usou o fallback padrao do `docker-compose.yml`. O startup do backend executou `initDatabase.js` e criou as tabelas/usuario padrao nesse banco montado. O tenant DB existente e `tenant_2.db`, tambem sem projetos.

Portanto, o problema em producao nao e apenas vinculo de projeto: o banco atualmente montado pelo container nao e o banco que contem os dados esperados.

### 19.10 Plano exato de recuperacao

Nao executar sem autorizacao explicita.

1. Manter containers como estao por enquanto. Nao reiniciar e nao fazer deploy.
2. Fazer copia de seguranca dos arquivos atualmente montados, antes de qualquer troca:
   - `/home/ubuntu/app_data/gestao-obras-vetor/database/gestao_obras.db`
   - `/home/ubuntu/app_data/gestao-obras-vetor/database/tenants/tenant_2.db`
   - `/home/ubuntu/app_data/gestao-obras-vetor/uploads`
3. Identificar a fonte correta dos dados:
   - banco local previamente encontrado em `backend/database/gestao_obras.db` e `backend/database/tenants/tenant_1.db`;
   - outro backup externo, caso exista fora deste servidor;
   - snapshot/disco/backup do provedor antes de 2026-06-12 15:24 UTC.
4. Validar offline a base correta antes de montar em producao:
   - confirmar projetos `UFV IPATINGA l` e `UFV MESQUITA 1`;
   - confirmar RDOs, EAP, RNCs, anexos e usuarios esperados;
   - confirmar qual tenant_id deve ser usado em producao.
5. Planejar janela controlada para substituicao ou troca de mount:
   - parar aplicacao somente durante janela autorizada;
   - preservar os bancos vazios atuais com timestamp;
   - colocar os bancos corretos no caminho realmente montado ou ajustar `APP_DATA_DIR` para o diretorio correto;
   - subir e validar healthcheck;
   - validar login, tenant ativo, projetos e anexos.
6. Depois que o banco correto estiver restaurado, corrigir vinculos de projeto somente se ainda necessario e somente com backup confirmado.
7. Criar rotina de backup real para o caminho ativo atual:
   - `/home/ubuntu/app_data/gestao-obras-vetor/database`
   - `/home/ubuntu/app_data/gestao-obras-vetor/uploads`

Comandos que continuam proibidos ate autorizacao:

- `docker compose down`
- `docker compose down -v`
- migrations
- deploy
- alteracao de `.env`
- alteracao de `APP_DATA_DIR`
- restore de backup
- qualquer `INSERT`, `UPDATE`, `DELETE`, `ALTER` ou `DROP`

## 20. Atualizacao das correcoes preventivas - 2026-07-22

As correcoes preventivas foram registradas no commit `b840c32` da branch `codex/correcoes-mapa-riscos`, publicada no remoto, mas ainda nao foram implantadas em producao:

- perfis invalidos ou ausentes passam a ser negados pela autenticacao, sem fallback para ADM;
- o entrypoint de producao deixa de aplicar migrations automaticamente e apenas valida banco e status das migrations;
- o script de backup diario passa a incluir banco principal, todos os tenants e uploads por meio de `backupDatabase.js`.

Essas alteracoes nao restauram dados, nao trocam volumes e nao reiniciam containers. O plano de recuperacao da secao 19.10 continua necessario se a producao estiver com projetos ou dados ausentes. A atualizacao pode ser deixada para uma janela posterior desde que nao haja incidente ativo; se houver dados faltando na interface atual, a verificacao somente leitura dos volumes e bancos nao deve ser adiada.

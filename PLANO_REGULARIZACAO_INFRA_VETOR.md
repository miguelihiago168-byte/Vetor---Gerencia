# Plano de regularizacao da infraestrutura Vetor

Status: Fase 4 concluida. Fases 5 em diante aguardam autorizacao explicita.

## Causa raiz

A verificacao direta no servidor confirmou que o backend em producao de testes esta usando o bind mount:

```text
/home/ubuntu/app_data/gestao-obras-vetor/database -> /app/database
```

Esse diretorio continha um banco SQLite novo/incompleto. Como `APP_DATA_DIR` nao esta definido explicitamente no container nem no `.env` do servidor, o Docker Compose usou o fallback do `docker-compose.yml`. O startup atual executou inicializacao automatica e criou tabelas/usuario padrao no banco montado.

## Arquitetura de dados definida

Arquitetura alvo, ainda nao implementada nesta fase:

- Banco principal: tenants, autenticacao, vinculos de usuarios e configuracoes globais.
- Bancos tenant: projetos, EAP, RDO, RNC, compras, almoxarifado, anexos e auditoria operacional.
- Bancos tenant devem ser criados a partir de schema limpo e migrations controladas, nunca por copia de banco com dados.
- Startup de producao deve validar banco/schema e falhar de forma clara se o banco estiver ausente, vazio ou inconsistente.

## Caminhos oficiais

Caminhos alvo do plano:

```text
APP_DATA_DIR=/home/ubuntu/app_data/gestao-obras-vetor
database=/home/ubuntu/app_data/gestao-obras-vetor/database
uploads=/home/ubuntu/app_data/gestao-obras-vetor/uploads
backups=/home/ubuntu/backups/gestao-obras-vetor
```

Na Fase 1, o backup foi salvo fora do diretorio montado pelo container:

```text
/root/vetor-phase1-backups/phase1_20260613_000509_+0200
```

## Alteracoes realizadas

Fase 2 executada:

- `docker-compose.yml` nao usa mais fallback silencioso para `APP_DATA_DIR`.
- `docker-compose.yml` passa `APP_DATA_DIR` explicitamente ao container do backend.
- Workflow ativo `.github/workflows/deploy.yml` define `APP_DATA_DIR=/home/ubuntu/app_data/gestao-obras-vetor`.
- Workflow ativo valida o diretorio oficial antes de `docker compose up`.
- Workflow ativo localiza o diretorio do compose quando `APP_DIR` aponta para a raiz do repo ou para `gestao-obras-vetor`.
- Criado `gestao-obras-vetor/scripts/validate_data_dir.sh` para falhar se `APP_DATA_DIR` estiver ausente, diferente do caminho oficial, sem permissao ou sem banco principal.
- `gestao-obras-vetor/scripts/server-setup.sh` deixou de apontar backup para `/home/ubuntu/app/gestao-obras-vetor/backend/database` e passou a usar `/home/ubuntu/app_data/gestao-obras-vetor/database`.
- `gestao-obras-vetor/scripts/server-setup.sh` passou a documentar o caminho real atual do app em `/root/Vetor---Gerencia/gestao-obras-vetor`.

Fase 3 executada:

- `docker-compose.yml` define `NODE_ENV=production` explicitamente para o backend.
- `backend/entrypoint.sh` deixou de executar `initDatabase.js` e `migrate_multitenancy.js` em producao.
- Em producao, `backend/entrypoint.sh` executa `scripts/validateStartupDatabase.js` antes do servidor.
- `scripts/validateStartupDatabase.js` abre SQLite em modo somente leitura e valida banco principal, tenants ativos, tabelas obrigatorias, metadados e dados operacionais.
- `backend/config/database.js` nao cria diretorios nem banco principal em producao.
- `backend/config/database.js` nao copia o banco principal para criar tenant DB em producao.
- `backend/config/database.js` nao apaga/recria tenant DB divergente em producao.
- `backend/server.js` desativa migrations automaticas de startup em producao.
- `runQuery` bloqueia `CREATE`, `ALTER` e `DROP` automaticos quando `DISABLE_STARTUP_SCHEMA_MUTATIONS=true` em producao.

Fase 4 executada:

- Criado pipeline de migrations versionadas em `backend/scripts/runMigrations.js`.
- Criado diretorio `backend/scripts/migrations/` para migrations numeradas e deterministicas.
- Criada documentacao em `backend/scripts/migrations/README.md`.
- Adicionados scripts npm `migrate`, `migrate:dry-run` e `migrate:status`.
- O runner suporta `--main-only`, `--tenants-only`, `--dry-run` e `--status`.
- O runner abre banco em modo somente leitura quando usado com `--dry-run` ou `--status`.
- Execucao real em producao exige `MIGRATIONS_ALLOW_PRODUCTION=true`.
- Nenhuma migration de schema real foi criada nesta fase.
- Nenhuma migration foi executada em producao.

Fase 1 executada:

- Lidos os diagnosticos e arquivos de infraestrutura solicitados.
- Confirmado que o backup deveria cobrir os caminhos atualmente montados:
  - `/home/ubuntu/app_data/gestao-obras-vetor/database`
  - `/home/ubuntu/app_data/gestao-obras-vetor/uploads`
- Criado backup com timestamp fora de `/home/ubuntu/app_data`.
- Gerados manifesto, checksums SHA-256, listagens dos archives e resumo de contagens dos bancos de origem.
- Validado que os archives podem ser abertos/listados.

Nenhuma correcao de infraestrutura foi aplicada nesta fase.

## Backup

Backup criado no servidor `161.97.136.203`:

```text
backup_dir=/root/vetor-phase1-backups/phase1_20260613_000509_+0200
manifest=/root/vetor-phase1-backups/phase1_20260613_000509_+0200/MANIFEST.txt
database_archive=/root/vetor-phase1-backups/phase1_20260613_000509_+0200/database_20260613_000509_+0200.tar.gz
uploads_archive=/root/vetor-phase1-backups/phase1_20260613_000509_+0200/uploads_20260613_000509_+0200.tar.gz
```

Metadados registrados:

```text
data_servidor=2026-06-13T00:05:09+02:00
host=161.97.136.203
hostname=vmi2025831
usuario_ssh=root
app_dir=/root/Vetor---Gerencia/gestao-obras-vetor
commit=d74bbf1a7b400e44c51adc639feadd5071c28a5e
docker_compose_version=Docker Compose version 2.40.3+ds1-0ubuntu1~24.04.1
```

Tamanhos:

| Item | Tamanho |
|---|---:|
| Fonte `database` | 659.318 bytes |
| Fonte `uploads` | 7.704.960 bytes |
| Archive database | 23.168 bytes |
| Archive uploads | 7.393.290 bytes |

Checksums SHA-256:

```text
400ce707bd42bb62741bd16579404e5743ce52e50764bb8ed81745f8489e0d62  database_20260613_000509_+0200.tar.gz
fb9464e3d25e89ce01d3aad499732bfbe696db91984bff602feedb3a3d20a086  uploads_20260613_000509_+0200.tar.gz
c30fe1ff1f22331e026cab5b23f249de71bcb29d866df14b8227e2cd14565eee  docker-ps.txt
```

Validacao do backup:

- `gzip -t` executado nos dois archives.
- `tar -tzf` executado nos dois archives.
- Archive de banco contem:
  - `database/`
  - `database/gestao_obras.db`
  - `database/tenants/`
  - `database/tenants/tenant_2.db`
- Archive de uploads contem `uploads/` e 12 entradas de arquivos/subdiretorios.

Contagens dos bancos de origem no momento do backup:

| Banco | Usuarios | Tenants | Usuario tenants | Projetos | Vinculos | RDOs | EAP | RNC | Anexos |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `gestao_obras.db` | 5 | 3 | 5 | 0 | 0 | 0 | 0 | 0 | 0 |
| `tenant_2.db` | 3 | 3 | 3 | 0 | 0 | 0 | 0 | 0 | 0 |

Este backup e apenas rollback tecnico do estado atual de testes. Ele nao e solucao definitiva.

## Migrations criadas

Nenhuma migration de schema real foi criada ou executada ate a Fase 4.

A Fase 4 criou apenas a infraestrutura de versionamento e execucao controlada:

- `gestao-obras-vetor/backend/scripts/runMigrations.js`
- `gestao-obras-vetor/backend/scripts/migrations/README.md`

## Scripts criados

Fase 2 criou:

- `gestao-obras-vetor/scripts/validate_data_dir.sh`

Fase 3 criou:

- `gestao-obras-vetor/backend/scripts/validateStartupDatabase.js`

Fase 4 criou:

- `gestao-obras-vetor/backend/scripts/runMigrations.js`
- `gestao-obras-vetor/backend/scripts/migrations/README.md`

O script da Fase 2 valida:

- `APP_DATA_DIR` definido;
- valor oficial `/home/ubuntu/app_data/gestao-obras-vetor`;
- existencia e permissao dos diretorios `database` e `uploads`;
- existencia do banco principal `database/gestao_obras.db`.

Foi usado apenas um script temporario local para executar o backup remoto via SSH. O script temporario foi removido da maquina local apos a execucao.

## Testes

Testes/verificacoes executados na Fase 1:

- Leitura dos arquivos exigidos no plano.
- SSH no servidor de testes `161.97.136.203`.
- Criacao de archives com `tar`.
- Validacao de integridade gzip com `gzip -t`.
- Validacao de abertura/listagem com `tar -tzf`.
- Geracao de `SHA256SUMS.txt` com `sha256sum`.
- Consulta SQLite em modo somente leitura (`mode=ro`) para registrar contagens dos bancos de origem.

Nao foram executados testes automatizados da aplicacao nesta fase, pois a Fase 1 e exclusivamente backup do estado atual.

## Deploy

Nenhum deploy foi executado.

Nenhum container foi reiniciado.

Nenhum arquivo `.env` foi alterado.

O workflow de deploy foi alterado para exportar `APP_DATA_DIR` explicitamente antes de executar `docker compose`.

## Validacao

Validacao de Fase 2 concluida:

- `sh scripts/validate_data_dir.sh` local falha quando o caminho oficial nao existe no ambiente local.
- `bash -n scripts/validate_data_dir.sh` validou a sintaxe do script.
- `rg` confirmou que `docker-compose.yml` nao contem mais fallback `APP_DATA_DIR:-...`.
- Leitura automatizada confirmou que `.github/workflows/deploy.yml` e `docker-compose.yml` nao contem tabs.
- `docker compose config` nao foi executado localmente porque Docker nao esta disponivel neste ambiente.

Validacao de Fase 3 concluida:

- `node --check backend/scripts/validateStartupDatabase.js`
- `node --check backend/config/database.js`
- `node --check backend/server.js`
- `bash -n backend/entrypoint.sh`
- `node backend/scripts/validateStartupDatabase.js` executado localmente em modo somente leitura.
- Teste de bloqueio confirmou que `CREATE TABLE` e recusado em producao com `DISABLE_STARTUP_SCHEMA_MUTATIONS=true`.

Validacao de Fase 4 concluida:

- `node --check backend/scripts/runMigrations.js`
- `npm run migrate:dry-run` via `cmd /c npm`, apenas leitura.
- `npm run migrate:status` via `cmd /c npm`, apenas leitura.
- `node scripts/runMigrations.js --help`
- Teste de producao confirmou que `NODE_ENV=production node scripts/runMigrations.js` falha sem `MIGRATIONS_ALLOW_PRODUCTION=true`.

Validacao de Fase 1 concluida:

- Backup criado fora do diretorio montado.
- Manifesto criado.
- Checksums criados.
- Archives listaveis.
- Banco principal e banco tenant atual incluidos no backup.
- Uploads atuais incluidos no backup.

## Riscos restantes

- O banco atualmente montado continua vazio para dados operacionais.
- O backup atualizado em `server-setup.sh` ainda e simples e sera substituido por rotina real na Fase 8.
- Algumas rotas ainda possuem codigo legado de schema lazy, mas as mutacoes de schema por `runQuery` ficam bloqueadas em producao.
- Ainda falta migrar o schema legado para migrations reais dentro do novo pipeline.

## Plano de rollback

Rollback tecnico disponivel para o estado atual de testes:

1. Usar os archives da Fase 1 apenas se for necessario voltar exatamente ao estado atual.
2. Validar checksums antes de qualquer restauracao.
3. Restaurar somente em janela autorizada.
4. Preservar novamente o estado que estiver em producao antes de sobrescrever qualquer arquivo.

Nenhuma restauracao foi executada na Fase 1.

## Branches e commits

Branch de trabalho da Fase 1:

```text
codex/phase1-backup
```

Commit da Fase 1:

```text
5c4be454d932e9617ab322f29b5604b38466ba7d docs: record phase 1 infrastructure backup
```

Branch de trabalho da Fase 2:

```text
codex/phase2-data-path
```

Commit da Fase 2:

```text
6ceaf43ae2b6113ef57cae057f1eef4febc7b4c8 fix: require explicit app data directory
```

Branch de trabalho da Fase 3:

```text
codex/phase3-startup-guard
```

Commit da Fase 3:

```text
c88c9ee2bb1b459fe23eebbd2e02da119280cb3f fix: guard production database startup
```

Branch de trabalho da Fase 4:

```text
codex/phase4-migration-pipeline
```

Commit da Fase 4 sera registrado apos versionamento.

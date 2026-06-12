# Plano de regularizacao da infraestrutura Vetor

Status: Fase 5 concluida no ambiente de testes. Fases 6 em diante aguardam autorizacao explicita.

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
- `scripts/validateStartupDatabase.js` abre SQLite em modo somente leitura e valida banco principal, tenants ativos, tabelas obrigatorias, metadados e contagens operacionais.
- `scripts/validateStartupDatabase.js` permite zero projetos/RDOs/EAP/RNC/anexos, pois o ambiente de testes pode ser recriado do zero; o bloqueio de banco vazio considera ausencia de arquivo, schema, usuarios ou tenants.
- `scripts/validateStartupDatabase.js` valida arquivos tenant existentes e apenas alerta quando um tenant ativo ainda nao possui `tenant_<id>.db`; o acesso desse tenant segue bloqueado por `ensureTenantDatabase()` ate correcao manual.
- `backend/config/database.js` nao cria diretorios nem banco principal em producao.
- `backend/config/database.js` nao copia o banco principal para criar tenant DB em producao.
- `backend/config/database.js` nao apaga/recria tenant DB divergente em producao.
- `backend/server.js` desativa migrations automaticas de startup em producao.
- `runQuery` bloqueia `CREATE`, `ALTER` e `DROP` automaticos quando `DISABLE_STARTUP_SCHEMA_MUTATIONS=true` em producao.

Fase 5 executada no servidor de testes:

- Confirmado deploy ativo no commit `932f0025ee96762945b5536dbddfdd56aa5a9531`.
- Confirmado backend e frontend ativos antes da limpeza controlada.
- Confirmado mount oficial:
  - `/home/ubuntu/app_data/gestao-obras-vetor/database -> /app/database`
  - `/home/ubuntu/app_data/gestao-obras-vetor/uploads -> /app/uploads`
- Criado backup pre-limpeza da Fase 5.
- Containers parados com `docker compose stop`, sem `docker compose down` e sem `down -v`.
- Diretorios antigos preservados com timestamp.
- Criada estrutura limpa em `/home/ubuntu/app_data/gestao-obras-vetor/database` e `/home/ubuntu/app_data/gestao-obras-vetor/uploads`.
- Banco principal inicializado manualmente.
- Migrations legadas executadas manualmente em modo controlado no ambiente limpo.
- `tenant_1.db` recriado manualmente a partir do schema atualizado.
- Containers subidos novamente com `docker compose up -d`.
- Health check `/api/health` validado com sucesso.

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

Backup pre-limpeza da Fase 5:

```text
backup_dir=/root/vetor-phase5-backups/phase5_preclean_20260613_005947_+0200
database_archive=/root/vetor-phase5-backups/phase5_preclean_20260613_005947_+0200/database_20260613_005947_+0200.tar.gz
uploads_archive=/root/vetor-phase5-backups/phase5_preclean_20260613_005947_+0200/uploads_20260613_005947_+0200.tar.gz
preserved_dir=/home/ubuntu/app_data/gestao-obras-vetor/phase5_preserved_20260613_010058_+0200
```

Checksums SHA-256 da Fase 5:

```text
b9aeef4743a939a8a91761c16b9860ff4e1177ca2f2b65cb66f63666303a98ac  database_20260613_005947_+0200.tar.gz
fb9464e3d25e89ce01d3aad499732bfbe696db91984bff602feedb3a3d20a086  uploads_20260613_005947_+0200.tar.gz
```

Estado final dos bancos ativos apos Fase 5:

| Banco | Usuarios | Tenants | Usuario tenants | Projetos | Vinculos | RDOs | EAP | RNC | Anexos |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `gestao_obras.db` | 1 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| `tenant_1.db` | 1 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |

## Migrations criadas

Nenhuma migration foi criada ou executada na Fase 1.

## Scripts criados

Fase 2 criou:

- `gestao-obras-vetor/scripts/validate_data_dir.sh`

Fase 3 criou:

- `gestao-obras-vetor/backend/scripts/validateStartupDatabase.js`

Esse script valida:

- `APP_DATA_DIR` definido;
- valor oficial `/home/ubuntu/app_data/gestao-obras-vetor`;
- existencia e permissao dos diretorios `database` e `uploads`;
- existencia do banco principal `database/gestao_obras.db`.

Foram usados scripts temporarios locais para executar os comandos remotos via SSH. Os scripts temporarios foram removidos da maquina local apos a execucao.

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

Testes/verificacoes executados na Fase 5:

- Confirmacao de commit remoto, Docker Compose e containers.
- Confirmacao dos mounts reais do backend.
- Backup pre-limpeza com `tar`, `gzip -t`, listagem e `sha256sum`.
- Preservacao dos diretorios antigos em `phase5_preserved_20260613_010058_+0200`.
- Inicializacao manual do banco principal.
- Execucao manual das migrations legadas.
- Recriacao manual de `tenant_1.db`.
- `docker compose ps` apos subida.
- `curl -fsS http://127.0.0.1/api/health`.
- Contagens SQLite em modo somente leitura dentro do container.

## Deploy

Nenhum deploy foi executado.

Nenhum container foi reiniciado.

Nenhum arquivo `.env` foi alterado.

O workflow de deploy foi alterado para exportar `APP_DATA_DIR` explicitamente antes de executar `docker compose`.

Na Fase 5, houve parada e subida controlada dos containers no servidor de testes:

```text
docker compose stop
docker compose up -d
```

Nao foi executado `docker compose down` nem `docker compose down -v`.

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

Validacao de Fase 1 concluida:

- Backup criado fora do diretorio montado.
- Manifesto criado.
- Checksums criados.
- Archives listaveis.
- Banco principal e banco tenant atual incluidos no backup.
- Uploads atuais incluidos no backup.

Validacao de Fase 5 concluida:

- Backend `gestao-backend` em estado `Up`.
- Frontend `gestao-frontend` em estado `Up`.
- `/api/health` retornou `status=OK`.
- Banco ativo contem somente `gestao_obras.db` e `tenant_1.db`.
- Diretorio antigo preservado em `phase5_preserved_20260613_010058_+0200`.

## Riscos restantes

- O banco atualmente montado foi recriado e continua sem dados operacionais por decisao da Fase 5.
- O backup atualizado em `server-setup.sh` ainda e simples e sera substituido por rotina real na Fase 8.
- Nao existe ainda pipeline de migrations versionado.
- Algumas rotas ainda possuem codigo legado de schema lazy, mas as mutacoes de schema por `runQuery` ficam bloqueadas em producao.
- Logs ainda mostram tentativas legadas de `CREATE/ALTER` em runtime; isso deve ser tratado nas fases de migrations centralizadas/modelo de tenants.

## Plano de rollback

Rollback tecnico disponivel para o estado atual de testes:

1. Usar os archives da Fase 1 apenas se for necessario voltar exatamente ao estado atual.
2. Validar checksums antes de qualquer restauracao.
3. Restaurar somente em janela autorizada.
4. Preservar novamente o estado que estiver em producao antes de sobrescrever qualquer arquivo.

Nenhuma restauracao foi executada na Fase 1.

Nenhuma restauracao foi executada na Fase 5. O rollback tecnico pode usar:

- backup `/root/vetor-phase5-backups/phase5_preclean_20260613_005947_+0200`;
- diretorio preservado `/home/ubuntu/app_data/gestao-obras-vetor/phase5_preserved_20260613_010058_+0200`.

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

Hotfix da Fase 3:

```text
68c8b5e181ce19972782332aba349a2103ef0a83 fix: allow empty test tenant databases at startup
```

Branch de registro da Fase 5:

```text
codex/phase5-test-reset
```

Commit da Fase 5 sera registrado apos versionamento.

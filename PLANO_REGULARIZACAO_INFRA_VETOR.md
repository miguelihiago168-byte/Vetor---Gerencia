# Plano de regularizacao da infraestrutura Vetor

Status: Fase 1 concluida. Fases 2 em diante aguardam autorizacao explicita.

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

Nenhuma migration foi criada ou executada na Fase 1.

## Scripts criados

Nenhum script persistente do projeto foi criado na Fase 1.

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

Nenhum arquivo `.env` ou `APP_DATA_DIR` foi alterado.

## Validacao

Validacao de Fase 1 concluida:

- Backup criado fora do diretorio montado.
- Manifesto criado.
- Checksums criados.
- Archives listaveis.
- Banco principal e banco tenant atual incluidos no backup.
- Uploads atuais incluidos no backup.

## Riscos restantes

- O startup de producao ainda cria/inicializa banco automaticamente.
- `APP_DATA_DIR` ainda nao esta definido explicitamente no deploy.
- O banco atualmente montado continua vazio para dados operacionais.
- A rotina antiga de backup ainda aponta para caminho obsoleto.
- Nao existe ainda protecao contra banco vazio acidental.
- Nao existe ainda pipeline de migrations versionado.

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
fix/database-path
```

Commit da Fase 1 sera registrado apos versionamento deste documento.

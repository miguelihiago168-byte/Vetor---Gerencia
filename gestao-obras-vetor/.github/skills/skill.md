---
name: deployment-worker
version: 1.0.0
description: "Use quando: fizer deploy, reiniciar servicos, diagnosticar falha de publicacao ou reinstalar a aplicacao no servidor AWS EC2."
tags:
  - deploy
  - ec2
  - docker
  - reinstall
  - rollback
---

# Deployment Worker

## Objetivo

Executar deploy seguro da aplicacao no servidor EC2 e, quando necessario, fazer reinstalacao limpa com validacao final.

## Escopo

- Ambiente alvo: servidor EC2 Linux
- Acesso: SSH com chave privada local
- Usuario remoto: `ubuntu`
- Host: `52.14.148.96`
- Porta: `22`

## Entradas esperadas

- Branch, tag ou commit a publicar
- Tipo de execucao: deploy normal ou reinstalacao
- Janela de manutencao (quando houver indisponibilidade)

## Regras operacionais

1. Nunca executar comandos destrutivos sem backup minimo e confirmacao explicita.
2. Sempre validar estado atual antes de alterar (git status, containers, saude do app).
3. Em erro de deploy, tentar rollback para o ultimo commit estavel.
4. Registrar no retorno final: versao publicada, evidencias de saude e eventuais pendencias.

## Procedimento 1: Pre-check local

No root do repositorio local:

```powershell
Test-Path .\keys\aws_pb_key
```

Teste rapido de conectividade:

```powershell
ssh -i .\keys\aws_pb_key -p 22 ubuntu@52.14.148.96 "echo CONNECT_OK && hostname && whoami"
```

Se falhar por permissao, revisar chave e usuario.

## Procedimento 2: Deploy padrao (sem reinstalar do zero)

### 2.1 Conectar no servidor

```bash
ssh -i ./keys/aws_pb_key -p 22 ubuntu@52.14.148.96
```

### 2.2 Descobrir pasta do projeto e estado atual

```bash
pwd
ls -la
```

Se necessario, localizar o projeto:

```bash
find /home/ubuntu -maxdepth 3 -type f -name docker-compose.yml
```

Entrar no diretorio correto e atualizar codigo:

```bash
cd /home/ubuntu/gestao-obras-vetor
git fetch --all --prune
git status
git checkout main
git pull --ff-only origin main
```

### 2.3 Subir stack com rebuild seguro

```bash
docker compose pull
docker compose up -d --build
docker compose ps
```

### 2.4 Validacao de saude

```bash
docker compose logs backend --tail 120
docker compose logs frontend --tail 120
curl -I http://localhost
```

Criterio de sucesso: containers `Up`, logs sem erro recorrente e resposta HTTP valida.

## Procedimento 3: Reinstalacao limpa (quando deploy normal nao resolve)

Use apenas quando houver corrupcao de ambiente, imagem inconsistente ou falha persistente.

### 3.1 Backup minimo

```bash
cd /home/ubuntu/gestao-obras-vetor
mkdir -p /home/ubuntu/backups
cp -a .env /home/ubuntu/backups/.env.$(date +%F-%H%M%S)
```

Se houver volume/banco local, salvar dump antes de remover containers/volumes.

### 3.2 Parada e limpeza

```bash
cd /home/ubuntu/gestao-obras-vetor
docker compose down --remove-orphans
docker system prune -f
```

Se precisar limpeza total de volumes do projeto (risco de perda de dados):

```bash
docker compose down -v --remove-orphans
```

### 3.3 Reprovisionar app

```bash
git fetch --all --prune
git reset --hard origin/main
docker compose build --no-cache
docker compose up -d
docker compose ps
```

### 3.4 Migracoes e inicializacao (se aplicavel)

```bash
docker compose exec backend node scripts/initDatabase.js
```

Executar migracoes adicionais somente quando necessario e com rastreabilidade.

### 3.5 Validacao final

```bash
docker compose logs --tail 200
curl -I http://localhost
```

## Procedimento 4: Rollback rapido

Quando a versao nova falhar apos deploy:

```bash
cd /home/ubuntu/gestao-obras-vetor
git log --oneline -n 5
git checkout <commit_estavel>
docker compose up -d --build
docker compose ps
```

Se o rollback for definitivo, alinhar branch e tag posteriormente.

## Checklist de saida obrigatorio

- Commit/tag publicado
- Resultado de `docker compose ps`
- Evidencia de saude (logs/curl)
- Acao realizada: deploy normal ou reinstalacao
- Impacto observado e proximos passos

## Troubleshooting rapido

- `Permission denied (publickey)`: validar chave `keys/aws_pb_key`, usuario `ubuntu` e permissoes da chave.
- `Connection timed out`: validar servidor online e porta 22 no Security Group.
- Container reiniciando em loop: inspecionar logs do servico afetado e variaveis de ambiente.
- Falha de build: limpar cache com `docker compose build --no-cache`.

## Notas

- Preferir `docker compose` (sem hifen) para ambientes atuais.
- Sempre encerrar sessao SSH ao concluir: `exit`.
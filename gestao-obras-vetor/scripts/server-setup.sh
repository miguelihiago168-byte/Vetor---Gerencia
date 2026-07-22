#!/bin/bash
# =============================================================
# Script de configuração inicial do servidor EC2 (Ubuntu 22.04)
# Execute UMA VEZ após criar a instância EC2.
#
# Como usar:
#   chmod +x server-setup.sh
#   ./server-setup.sh
# =============================================================

set -e

echo "======================================"
echo " Configurando servidor Vetor Gestão"
echo "======================================"

echo ""
echo ">>> [1/6] Atualizando sistema..."
sudo apt-get update -y
sudo apt-get upgrade -y

echo ""
echo ">>> [2/6] Instalando dependências base do servidor..."
sudo apt-get install -y ca-certificates curl gnupg git chromium-browser

sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu \
$(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

echo ""
echo ">>> [3/6] Instalando Docker e Docker Compose..."
sudo apt-get update -y
sudo apt-get install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin

echo ""
echo ">>> [4/6] Adicionando usuário ao grupo docker..."
sudo usermod -aG docker ubuntu

echo ""
echo ">>> [5/6] Criando diretório da aplicação..."
mkdir -p /home/ubuntu/app

echo ""
echo ">>> [6/6] Criando script de backup do banco..."
cat > /home/ubuntu/backup-db.sh << 'EOF'
set -Eeuo pipefail
#!/bin/bash
# Backup diário do banco SQLite
APP_DATA_DIR="/home/ubuntu/app_data/gestao-obras-vetor"
BACKUP_DIR="/home/ubuntu/backups/gestao-obras-vetor"
BACKUP_IMAGE="gestao-obras-vetor-backend"
DB_PATH="$APP_DATA_DIR/database/gestao_obras.db"

mkdir -p "$BACKUP_DIR"

if [ -f "$APP_DATA_DIR/database/gestao_obras.db" ]; then
  # The image contains the canonical full backup script. Mounting the whole
  # directories preserves all tenant databases and uploaded files.
  docker run --rm \
    -e BACKUP_DIR=/app/backups \
    -v "$APP_DATA_DIR/database:/app/database:ro" \
    -v "$APP_DATA_DIR/uploads:/app/uploads:ro" \
    -v "$BACKUP_DIR:/app/backups" \
    "$BACKUP_IMAGE" node scripts/backupDatabase.js

  # Keep the 30 newest complete backups.
  find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name 'backup-*' -printf '%T@ %p\n' \
    | sort -nr \
    | awk 'NR > 30 {print $2}' \
    | xargs -r -d '\n' rm -rf
  exit 0
fi

if [ -f "$DB_PATH" ]; then
  cp "$DB_PATH" "$BACKUP_DIR/gestao_obras_$DATA.db"
  echo "[$(date)] Backup criado: gestao_obras_$DATA.db"
  # Manter apenas os últimos 30 backups
  ls -t "$BACKUP_DIR"/*.db | tail -n +31 | xargs -r rm
else
  echo "[$(date)] AVISO: banco de dados não encontrado em $DB_PATH"
fi
EOF

chmod +x /home/ubuntu/backup-db.sh

# Agendar backup diário às 03:00
(crontab -l 2>/dev/null; echo "0 3 * * * /home/ubuntu/backup-db.sh >> /home/ubuntu/backup.log 2>&1") | crontab -

echo ""
echo "======================================"
echo " ✅ Servidor configurado com sucesso!"
echo "======================================"
echo ""
echo "Versões instaladas:"
docker --version
docker compose version
git --version
chromium-browser --version || true
echo ""
echo "--------------------------------------"
echo " PRÓXIMOS PASSOS:"
echo "--------------------------------------"
echo ""
echo " 1. Saia e entre novamente no SSH para ativar o grupo docker:"
echo "    exit"
echo "    ssh -i chave.pem ubuntu@SEU_IP"
echo ""
echo " 2. Clone o repositório:"
echo "    cd /root"
echo "    git clone https://github.com/SEU_USUARIO/SEU_REPO.git Vetor---Gerencia"
echo ""
echo " 3. Crie o arquivo de ambiente:"
echo "    cd /root/Vetor---Gerencia/gestao-obras-vetor/backend"
echo "    cp .env.production.example .env"
echo "    nano .env   # edite o JWT_SECRET com uma chave forte"
echo ""
echo " 4. Suba os containers:"
echo "    mkdir -p /home/ubuntu/app_data/gestao-obras-vetor/database /home/ubuntu/app_data/gestao-obras-vetor/uploads"
echo "    cd /root/Vetor---Gerencia/gestao-obras-vetor"
echo "    export APP_DATA_DIR=/home/ubuntu/app_data/gestao-obras-vetor"
echo "    sh scripts/validate_data_dir.sh \"\$APP_DATA_DIR\""
echo "    docker compose up -d --build"
echo ""
echo " 5. Verifique se tudo subiu:"
echo "    docker compose ps"
echo "    curl http://localhost/api/health"
echo "    docker exec gestao-backend printenv PUPPETEER_EXECUTABLE_PATH"
echo "    docker exec gestao-backend ls -l /usr/bin/chromium-browser"
echo ""
echo " 6. Acesse no browser: http://SEU_IP"
echo "    Login: 000001  |  Senha: 123456"
echo ""

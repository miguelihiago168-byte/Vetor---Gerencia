#!/bin/sh
set -e

echo ">>> Inicializando banco de dados..."
if [ "${NODE_ENV:-development}" = "production" ]; then
  echo ">>> Validando banco de producao em modo somente leitura..."
  DB_USER="${DB_MIGRATIONS_USER:-$DB_USER}" DB_PASSWORD="${DB_MIGRATIONS_PASSWORD:-$DB_PASSWORD}" node scripts/validateStartupDatabase.js

  echo ">>> Validando ausencia de migrations pendentes..."
  DB_USER="${DB_MIGRATIONS_USER:-$DB_USER}" DB_PASSWORD="${DB_MIGRATIONS_PASSWORD:-$DB_PASSWORD}" node scripts/runMigrations.js --status
else
  DB_USER="${DB_MIGRATIONS_USER:-$DB_USER}" DB_PASSWORD="${DB_MIGRATIONS_PASSWORD:-$DB_PASSWORD}" node scripts/bootstrapRlsDatabase.js
fi

echo ">>> Iniciando servidor..."
exec node server.js

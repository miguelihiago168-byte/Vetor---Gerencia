#!/bin/sh
set -e

echo ">>> Inicializando banco de dados..."
if [ "${NODE_ENV:-development}" = "production" ]; then
  echo ">>> Aplicando migrations de producao..."
  MIGRATIONS_ALLOW_PRODUCTION=true node scripts/runMigrations.js

  echo ">>> Validando banco de producao em modo somente leitura..."
  node scripts/validateStartupDatabase.js
else
  node scripts/initDatabase.js

  echo ">>> Aplicando migracao de multitenancy..."
  node scripts/migrate_multitenancy.js
fi

echo ">>> Iniciando servidor..."
exec node server.js

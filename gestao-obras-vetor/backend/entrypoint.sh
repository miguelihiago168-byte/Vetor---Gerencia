#!/bin/sh
set -e

echo ">>> Inicializando banco de dados..."
node scripts/initDatabase.js

echo ">>> Aplicando migração de multitenancy..."
node scripts/migrate_multitenancy.js

echo ">>> Iniciando servidor..."
exec node server.js

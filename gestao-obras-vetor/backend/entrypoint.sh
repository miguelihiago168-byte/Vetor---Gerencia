#!/bin/sh
set -e

echo ">>> Inicializando banco de dados..."
node scripts/initDatabase.js

echo ">>> Iniciando servidor..."
exec node server.js

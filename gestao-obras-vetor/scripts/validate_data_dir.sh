#!/bin/sh
set -eu

APP_DATA_DIR_VALUE="${1:-${APP_DATA_DIR:-}}"

if [ -z "$APP_DATA_DIR_VALUE" ]; then
  echo "APP_DATA_DIR nao definido." >&2
  exit 1
fi

case "$APP_DATA_DIR_VALUE" in
  /home/ubuntu/app_data/gestao-obras-vetor) ;;
  *)
    echo "APP_DATA_DIR invalido: $APP_DATA_DIR_VALUE" >&2
    echo "Valor esperado: /home/ubuntu/app_data/gestao-obras-vetor" >&2
    exit 1
    ;;
esac

for dir in "$APP_DATA_DIR_VALUE" "$APP_DATA_DIR_VALUE/database" "$APP_DATA_DIR_VALUE/uploads"; do
  if [ ! -d "$dir" ]; then
    echo "Diretorio obrigatorio ausente: $dir" >&2
    exit 1
  fi

  if [ ! -r "$dir" ] || [ ! -w "$dir" ] || [ ! -x "$dir" ]; then
    echo "Diretorio sem permissoes de leitura/escrita/acesso: $dir" >&2
    exit 1
  fi
done

if [ ! -f "$APP_DATA_DIR_VALUE/database/gestao_obras.db" ]; then
  echo "Banco principal ausente: $APP_DATA_DIR_VALUE/database/gestao_obras.db" >&2
  exit 1
fi

echo "APP_DATA_DIR valido: $APP_DATA_DIR_VALUE"

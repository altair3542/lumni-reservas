#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if ! command -v docker >/dev/null 2>&1; then
  echo 'Falta Docker. Instala un motor compatible: https://docs.docker.com/get-started/get-docker/' >&2
  exit 1
fi
compose_version=$(docker compose version --short 2>/dev/null) || {
  echo 'Falta Docker Compose. Instala Docker Compose v2.20 o superior.' >&2
  exit 1
}
compose_version=${compose_version#v}
major=${compose_version%%.*}
rest=${compose_version#*.}
minor=${rest%%.*}
case "$major:$minor" in
  *[!0-9:]*|:*) echo 'No se pudo identificar la versión de Docker Compose.' >&2; exit 1 ;;
esac
if [ "$major" -lt 2 ] || { [ "$major" -eq 2 ] && [ "$minor" -lt 20 ]; }; then
  echo 'Se requiere Docker Compose v2.20 o superior. Actualiza Docker Compose.' >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo 'El motor de Docker no está disponible. Abre Docker Desktop/OrbStack y espera a que arranque.' >&2
  echo 'Comprueba docker info y docker context ls. No se cambió tu contexto ni se inició la app.' >&2
  exit 1
fi
docker compose up --build -d --wait
address=$(docker compose port app 3000)
port=${address##*:}
echo "Demo lista: http://localhost:$port"

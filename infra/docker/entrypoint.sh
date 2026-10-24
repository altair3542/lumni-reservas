#!/bin/sh
set -eu
export DATABASE_URL="$(node infra/docker/database-url.mjs lumni_app)"
export TEST_DATABASE_URL="$(node infra/docker/database-url.mjs lumni_test)"
export SQL_DATABASE_URL="$(node infra/docker/database-url.mjs lumni_sql)"
# A0: esquema y datos demo idempotentes antes de aceptar tráfico.
pnpm db:setup
exec "$@"

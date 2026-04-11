#!/bin/sh
set -e

if [ "${SKIP_WAIT_FOR_PG:-0}" != "1" ]; then
  echo "=== Waiting for Postgres (Docker DNS + TCP) ==="
  node scripts/wait-for-postgres.js
fi

echo "=== Running database migrations ==="
node src/db/migrate.js

if [ "$RUN_SEED" = "true" ]; then
  echo "=== Seeding database ==="
  node src/db/seed.js
fi

echo "=== Starting: $@"
exec "$@"

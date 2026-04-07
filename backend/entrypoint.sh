#!/bin/sh
set -e

echo "=== Running database migrations ==="
node src/db/migrate.js

if [ "$RUN_SEED" = "true" ]; then
  echo "=== Seeding database ==="
  node src/db/seed.js
fi

echo "=== Starting: $@"
exec "$@"

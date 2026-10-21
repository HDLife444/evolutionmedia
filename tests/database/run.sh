#!/usr/bin/env bash
set -euo pipefail
project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
image='pgvector/pgvector@sha256:ac08538c6f8b9904c33c8224c5e5706dbe760aca29db1d096972b4052c22a75d'
container_id=''
cleanup() {
  if [[ -n "$container_id" ]]; then docker rm -fv "$container_id" >/dev/null; fi
}
trap cleanup EXIT
# Disposable test database: no published ports, no persistent volume, no credentials.
container_id="$(docker run -d --network none -e POSTGRES_HOST_AUTH_METHOD=trust "$image")"
ready=false
for attempt in {1..30}; do
  # The image starts a temporary server during initialization. Wait for PID 1
  # to become the final postgres process before accepting socket readiness.
  if docker exec "$container_id" sh -c 'test "$(cat /proc/1/comm)" = postgres && pg_isready -U postgres' >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
if [[ "$ready" != true ]]; then
  docker logs "$container_id"
  exit 1
fi
run_sql() {
  docker exec -i "$container_id" psql -X -U postgres -v ON_ERROR_STOP=1 < "$1"
}
run_sql "$project_root/tests/database/bootstrap.sql"
for migration in "$project_root"/supabase/migrations/*.sql; do run_sql "$migration"; done
run_sql "$project_root/tests/database/permissions.sql"
run_sql "$project_root/tests/database/ingestion.sql"
run_sql "$project_root/tests/database/indexing.sql"
run_sql "$project_root/tests/database/playlists.sql"
run_sql "$project_root/tests/database/music-server.sql"
echo 'Database migration and permission checks passed.'

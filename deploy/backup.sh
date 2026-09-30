#!/usr/bin/env bash
# Dump the interview database to backups/ and keep the newest N dumps (default 14).
#   ./backup.sh [--keep N]
# Restore: docker compose exec -T mongo sh -c 'mongorestore --archive --gzip --drop \
#   -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin' < backups/<file>
set -euo pipefail
cd "$(dirname "$0")"

keep=14
if [[ "${1:-}" == "--keep" ]]; then keep="${2:?--keep needs a number}"; fi

mkdir -p backups
out="backups/interview-$(date +%Y%m%d-%H%M%S).archive.gz"
# Credentials are read inside the container, so they never show up in the host process list
docker compose exec -T mongo sh -c 'mongodump --quiet --archive --gzip --db interview \
  -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin' > "$out"

if [[ ! -s "$out" ]]; then
  rm -f "$out"
  echo "backup failed: empty dump" >&2
  exit 1
fi
echo "$(date -Is) wrote $out ($(du -h "$out" | cut -f1))"

# Keep the newest $keep dumps
ls -1t backups/interview-*.archive.gz | tail -n +"$((keep + 1))" | xargs -r rm -f

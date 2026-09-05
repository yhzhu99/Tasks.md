#!/bin/sh
set -eu
cd "$(dirname "$0")"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
docker compose exec -T tasks node backup.js "/backups/$stamp"
tar -czf "backups/tasks-$stamp.tar.gz" -C backups "$stamp"
rm -r "backups/$stamp"
find backups -name 'tasks-*.tar.gz' -mtime +30 -delete

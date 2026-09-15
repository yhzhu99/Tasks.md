#!/usr/bin/env bash
# Deploy committed source only. Authentication uses your SSH key/agent.
set -euo pipefail
host=${DEPLOY_HOST:-root@154.29.158.137}
port=${DEPLOY_PORT:-25355}
cd "$(dirname "$0")/.."
revision=$(git rev-parse HEAD)
archive=$(mktemp)
trap 'rm -f "$archive"' EXIT
git archive "$revision" > "$archive"
ssh -p "$port" "$host" "mkdir -p /opt/tasks-md/releases/$revision"
scp -P "$port" "$archive" "$host:/opt/tasks-md/releases/$revision/source.tar"
ssh -p "$port" "$host" bash -s -- "$revision" <<'REMOTE'
set -euo pipefail
revision=$1
cd /opt/tasks-md
exec 9>.deploy.lock
flock -n 9 || { echo 'Another deployment is running'; exit 1; }
tar -xf "releases/$revision/source.tar" -C "releases/$revision"
rm "releases/$revision/source.tar"
docker build -t "tasks-md:$revision" "releases/$revision"
./backup.sh
previous=$(docker inspect tasks-md --format '{{.Config.Image}}')
printf 'services:\n  tasks:\n    image: tasks-md:%s\n' "$revision" > deployment.yml
if ! docker compose -f docker-compose.yml -f deployment.yml up -d --no-build --wait --wait-timeout 120 tasks; then
  printf 'services:\n  tasks:\n    image: %s\n' "$previous" > deployment.yml
  docker compose -f docker-compose.yml -f deployment.yml up -d --no-build --wait --wait-timeout 120 tasks
  echo 'Deployment failed; previous image restored.' >&2
  exit 1
fi
echo "Deployed $revision"
docker compose -f docker-compose.yml -f deployment.yml ps tasks
REMOTE

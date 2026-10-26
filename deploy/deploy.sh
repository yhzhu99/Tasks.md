#!/usr/bin/env bash
# Deploy committed source only. Authentication uses your SSH key/agent.
set -euo pipefail
host=${DEPLOY_HOST:-root@154.29.158.137}
port=${DEPLOY_PORT:-25355}
cd "$(dirname "$0")/.."
revision=$(git rev-parse HEAD)
keep=${TASKS_MD_KEEP_IMAGES:-3}
archive=$(mktemp)
trap 'rm -f "$archive"' EXIT
git archive "$revision" > "$archive"
ssh -p "$port" "$host" "mkdir -p /opt/tasks-md/releases/$revision"
scp -P "$port" "$archive" "$host:/opt/tasks-md/releases/$revision/source.tar"
ssh -p "$port" "$host" bash -s -- "$revision" "$keep" <<'REMOTE'
set -euo pipefail
revision=$1
keep=${2:-3}
cd /opt/tasks-md
exec 9>.deploy.lock
flock -n 9 || { echo 'Another deployment is running'; exit 1; }
tar -xf "releases/$revision/source.tar" -C "releases/$revision"
rm "releases/$revision/source.tar"
docker build -t "tasks-md:$revision" "releases/$revision" </dev/null
./backup.sh </dev/null
previous=$(docker inspect tasks-md --format '{{.Config.Image}}')
# Each image is about 247MB. Keep the active and rollback images plus the
# newest other releases; older tags are not used by the deploy script.
prune_images() {
  local keep="$1" current="$2" previous="$3"
  if [[ ! $keep =~ ^[1-9][0-9]*$ ]]; then
    echo 'TASKS_MD_KEEP_IMAGES must be a positive integer; skipping image cleanup.' >&2
    return 0
  fi
  local ref protected=()
  for ref in "$current" "$previous"; do
    [[ -n $ref ]] || continue
    if docker image inspect "$ref" >/dev/null 2>&1; then
      protected+=("$ref")
    fi
  done
  local budget=$keep
  if (( ${#protected[@]} >= budget )); then
    budget=0
  else
    budget=$((budget - ${#protected[@]}))
  fi
  local kept=0 tag image candidate skip
  while IFS= read -r tag; do
    [[ -n $tag && $tag != '<none>' ]] || continue
    image="tasks-md:${tag}"
    skip=false
    for candidate in "${protected[@]}"; do
      if [[ $candidate == "$image" ]]; then
        skip=true
        break
      fi
    done
    [[ $skip == true ]] && continue
    if (( kept < budget )); then
      kept=$((kept + 1))
    else
      docker image rm "$image" >/dev/null 2>&1 \
        || echo "kept in-use or missing image $image" >&2
    fi
  done < <(docker image ls tasks-md --format '{{.CreatedAt}}\t{{.Tag}}' | sort -r | cut -f2-)
}
printf 'services:\n  tasks:\n    image: tasks-md:%s\n' "$revision" > deployment.yml
if ! docker compose -f docker-compose.yml -f deployment.yml up -d --no-build --wait --wait-timeout 120 tasks </dev/null; then
  printf 'services:\n  tasks:\n    image: %s\n' "$previous" > deployment.yml
  docker compose -f docker-compose.yml -f deployment.yml up -d --no-build --wait --wait-timeout 120 tasks </dev/null
  echo 'Deployment failed; previous image restored.' >&2
  exit 1
fi
echo "Deployed $revision"
prune_images "$keep" "tasks-md:$revision" "$previous" || true
docker compose -f docker-compose.yml -f deployment.yml ps tasks
REMOTE

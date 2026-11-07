#!/usr/bin/env bash
# Run remotely as stitchdeploy after GitHub Actions rsyncs the source tree.
# No secrets are printed and no existing Docker volumes are deleted.
set -Eeuo pipefail
umask 077
sha="${1:-}"
if [[ ! "$sha" =~ ^[a-f0-9]{40}$ ]]; then echo 'Expected a full 40-character Git SHA' >&2; exit 2; fi

app=/opt/stitchmate/app
env_file=/opt/stitchmate/shared/.env.production
compose="$app/deploy/docker-compose.prod.yml"
backup_dir=/opt/stitchmate/backups
[[ -r "$env_file" ]] || { echo 'Missing readable server-side .env.production' >&2; exit 1; }
[[ -s "$app/pnpm-lock.yaml" ]] || { echo 'Commit pnpm-lock.yaml before deploying' >&2; exit 1; }
command -v docker >/dev/null || { echo 'Docker is not installed' >&2; exit 1; }
command -v flock >/dev/null || { echo 'flock is not installed' >&2; exit 1; }
mkdir -p "$backup_dir"
exec 9>/opt/stitchmate/shared/deployment.lock
flock -n 9 || { echo 'Another deployment is running' >&2; exit 1; }
cd "$app"
export RELEASE_SHA="$sha"
dc() { docker compose --project-name stitchmate --env-file "$env_file" -f "$compose" "$@"; }

# Validate Compose interpolation/config before changing running containers.
dc config --quiet
printf 'Starting private database and queue services...\n'
dc up -d postgres redis
healthy=0
for i in $(seq 1 40); do
  if dc exec -T postgres pg_isready -U stitchmate -d stitchmate >/dev/null 2>&1; then healthy=1; break; fi
  sleep 3
done
[[ "$healthy" == 1 ]] || { echo 'Postgres not ready' >&2; exit 1; }

printf 'Backing up PostgreSQL before migration...\n'
backup="$backup_dir/stitchmate-$(date -u +%Y%m%d-%H%M%S).dump"
dc exec -T postgres pg_dump -U stitchmate -d stitchmate --format=custom --no-owner --no-acl > "$backup"
[[ -s "$backup" ]] || { echo 'Backup failed' >&2; exit 1; }
dc exec -T postgres pg_restore --list < "$backup" >/dev/null
sha256sum "$backup" > "$backup.sha256"
printf 'Local backup verified. Copy it off-server and test restore regularly.\n'

printf 'Checking GitHub-built release image...\n'
docker image inspect "stitchmate/app:$sha" >/dev/null || { echo 'CI-built release image missing on VPS' >&2; exit 1; }
printf 'Applying forward-only Prisma migrations...\n'
dc run --rm --no-deps api pnpm --filter @stitchmate/api prisma:deploy
printf 'Switching applications to new release...\n'
dc up -d --no-build --remove-orphans api web worker proxy

# Validate internal endpoints; don't require public DNS to be fully propagated here.
dc exec -T api node -e "fetch('http://127.0.0.1:4000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
dc exec -T web node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
printf '%s\n' "$sha" > /opt/stitchmate/shared/current-release
printf 'Deployment healthy: %s\n' "$sha"
dc ps

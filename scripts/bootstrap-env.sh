#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if [ ! -f .env ]; then cp .env.example .env; echo 'Created .env from .env.example; replace placeholder secrets before use.'; fi
ln -sf ../../.env apps/api/.env
ln -sf ../../.env apps/worker/.env
ln -sf ../../.env apps/web/.env.local
printf '%s\n' 'Environment symlinks created. The root .env is not committed to git.'

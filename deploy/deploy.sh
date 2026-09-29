#!/usr/bin/env bash
set -euo pipefail

HOST="${1:?usage: deploy/deploy.sh <user@host> [git-ref]}"
REF="${2:-HEAD}"
COMPOSE="docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml"

git archive "$REF" | ssh "$HOST" 'mkdir -p ~/app && tar -x -C ~/app'
ssh "$HOST" "cd ~/app && $COMPOSE up -d --build --remove-orphans"

# Fail the run if the API does not come up, instead of reporting a green deploy.
ssh "$HOST" "cd ~/app && for i in \$(seq 1 30); do
  $COMPOSE exec -T frontend wget -qO- http://backend:8000/api/v1/health >/dev/null 2>&1 && echo 'backend healthy' && exit 0
  sleep 5
done
$COMPOSE logs --tail 60 backend migrate
exit 1"
ssh "$HOST" 'docker image prune -f >/dev/null'

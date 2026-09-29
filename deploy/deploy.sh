#!/usr/bin/env bash
set -euo pipefail

HOST="${1:?usage: deploy/deploy.sh <user@host>}"
REF="${2:-HEAD}"

git archive "$REF" | ssh "$HOST" 'mkdir -p ~/app && tar -x -C ~/app'
ssh "$HOST" 'cd ~/app && docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml up -d --build --remove-orphans'

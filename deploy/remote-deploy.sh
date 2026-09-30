#!/usr/bin/env bash
# Run by CI on the VM, from /opt/interview:  IMAGE=ghcr.io/<owner>/<repo> TAG=<sha> bash remote-deploy.sh
# Switches the app to $IMAGE:$TAG. If it does not come up healthy, switches back to the previous tag and fails.
set -euo pipefail
: "${IMAGE:?IMAGE is required}" "${TAG:?TAG is required}"

test -f .env || { echo ".env missing in $PWD - see docs/deploy-oracle.md"; exit 1; }

setvar() { if grep -q "^$1=" .env; then sed -i "s|^$1=.*|$1=$2|" .env; else echo "$1=$2" >> .env; fi; }

prev=$(sed -n 's/^IMAGE_TAG=//p' .env)
setvar IMAGE "$IMAGE"
setvar IMAGE_TAG "$TAG"

if ! { docker compose pull app && docker compose up -d --wait --wait-timeout 120; }; then
  echo "deploy of $TAG failed - rolling back to ${prev:-<none>}" >&2
  docker compose logs --tail 50 app >&2 || true
  if [[ -n "$prev" ]]; then
    setvar IMAGE_TAG "$prev"
    docker compose up -d --wait --wait-timeout 120 || echo "rollback to $prev did not become healthy either" >&2
  fi
  exit 1
fi

# Only a successful deploy moves the rollback pointer
[[ -n "$prev" && "$prev" != "$TAG" ]] && echo "$prev" > .prev_tag
docker compose ps

# Remove old images of THIS repository only (never a host-wide prune: other projects live here)
keep="$TAG fofl $(cat .prev_tag 2>/dev/null || true)"
docker image ls "$IMAGE" --format '{{.Tag}}' | while read -r t; do
  case " $keep " in *" $t "*) ;; *) [ "$t" = "<none>" ] || docker image rm "$IMAGE:$t" || true ;; esac
done
docker image ls "$IMAGE" --filter dangling=true -q | xargs -r docker image rm || true

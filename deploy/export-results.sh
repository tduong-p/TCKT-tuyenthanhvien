#!/usr/bin/env bash
# Export evaluations, candidates and users as JSON lines into the git clone results-backup/, commit when
# anything changed and push it to the private backup repo. Cron runs it every 2 minutes (docs/deploy-oracle.md).
# A push that fails is retried by the next run; restore a collection with mongoimport (see the docs).
set -euo pipefail
cd "$(dirname "$0")"

repo=results-backup
key=$PWD/results-key
compose=(${COMPOSE:-docker compose})

[[ -d $repo/.git ]] || { echo "no git clone in $PWD/$repo - see docs/deploy-oracle.md" >&2; exit 1; }

# Skip this run while the previous one is still going
mkdir -p backups
exec 9>backups/results.lock
flock -n 9 || exit 0

for c in evaluations candidates users; do
  # Credentials are read inside the container, so they never show up in the host process list
  "${compose[@]}" exec -T mongo sh -c "mongoexport --quiet --db interview --collection $c --sort '{_id: 1}' \
    -u \"\$MONGO_INITDB_ROOT_USERNAME\" -p \"\$MONGO_INITDB_ROOT_PASSWORD\" --authenticationDatabase admin" \
    > "$repo/$c.json.tmp" || { rm -f "$repo/$c.json.tmp"; echo "$(date -Is) export of $c failed" >&2; exit 1; }
  mv "$repo/$c.json.tmp" "$repo/$c.json"
done

cd "$repo"
[[ -f $key ]] && export GIT_SSH_COMMAND="ssh -i $key -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
git add -A
if ! git diff --cached --quiet; then
  git -c user.name=interview-backup -c user.email=interview-backup@localhost commit -q -m "results $(date -Is)"
fi
# Push whatever the remote lacks, including commits left behind by an earlier failed push
if [[ $(git rev-parse -q --verify HEAD || true) != "$(git rev-parse -q --verify origin/main || true)" ]]; then
  git push -q origin HEAD:main
  echo "$(date -Is) pushed $(git rev-parse --short HEAD)"
fi

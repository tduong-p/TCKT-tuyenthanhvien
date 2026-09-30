#!/usr/bin/env bash
# Remove the interview system from this host, leaving only a final backup in $HOME.
#   ./uninstall.sh --dry-run   print what would run
#   ./uninstall.sh             ask for confirmation, then run
#   ./uninstall.sh --force     also proceed when mongo is down and no dump exists (database is lost)
# Touches only: $INTERVIEW_DIR (default /opt/interview), the "interview" compose project and this
# repo's images, the "# interview-backup" crontab line, nginx site interview.conf, certbot cert "interview".
set -euo pipefail

DIR=${INTERVIEW_DIR:-/opt/interview}
SITE=interview.conf
CERT=interview
DRY=0
FORCE=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY=1 ;;
    --force) FORCE=1 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

run() {
  echo "+ $*"
  if [[ $DRY -eq 0 ]]; then "$@"; fi
}

if [[ $DRY -eq 0 ]]; then
  read -r -p "This deletes the interview system and its database from this host. Type 'interview' to continue: " answer
  [[ "$answer" == "interview" ]] || { echo "aborted"; exit 1; }
fi

final="$HOME/interview-final-backup-$(date +%Y%m%d-%H%M%S).archive.gz"
if [[ -d "$DIR" ]]; then
  cd "$DIR"
  # 1. Final backup, copied out of the directory we are about to delete
  running=$(docker compose ps --status running --services 2>/dev/null || true)
  if [[ $DRY -eq 1 ]] || grep -qx mongo <<<"$running"; then
    run ./backup.sh --keep 1000
  else
    echo "mongo is not running - using the newest existing dump instead of a fresh one"
  fi
  if [[ $DRY -eq 1 ]]; then
    echo "+ cp <newest backup> $final"
  else
    latest=$(ls -1t backups/interview-*.archive.gz 2>/dev/null | head -1 || true)
    if [[ -n "$latest" ]]; then
      cp "$latest" "$final"
      echo "final backup: $final"
    elif [[ $FORCE -eq 1 ]]; then
      echo "no dump found - continuing because of --force"
    else
      echo "no dump found and mongo is not running - start it (docker compose up -d mongo) or rerun with --force" >&2
      exit 1
    fi
  fi
  # 2. Containers, network and volumes of this project; then this repo's images only
  #    (mongo:8 may be shared with other projects, so a failed removal is fine)
  image=$(sed -n 's/^IMAGE=//p' .env 2>/dev/null || true)
  run docker compose down -v
  if [[ -n "$image" ]]; then
    ids=$(docker image ls "$image" -q | sort -u)
    if [[ -n "$ids" ]]; then
      # shellcheck disable=SC2086
      run docker image rm $ids || true
    fi
  fi
  run docker image rm mongo:8 || true
  cd /
fi

# 3. Backup cron line
cron=$(crontab -l 2>/dev/null || true)
if grep -q '# interview-backup' <<<"$cron"; then
  echo "+ crontab: remove line tagged # interview-backup"
  if [[ $DRY -eq 0 ]]; then { grep -v '# interview-backup' <<<"$cron" || true; } | crontab -; fi
fi

# 4. nginx site
if [[ -e /etc/nginx/sites-enabled/$SITE || -e /etc/nginx/sites-available/$SITE || $DRY -eq 1 ]]; then
  run sudo rm -f "/etc/nginx/sites-enabled/$SITE" "/etc/nginx/sites-available/$SITE"
  run sudo nginx -t
  run sudo systemctl reload nginx
fi

# 5. TLS certificate (only ours, not the shared one)
certs=$(sudo certbot certificates --cert-name "$CERT" 2>/dev/null || true)
if [[ $DRY -eq 1 ]] || grep -q "Certificate Name: $CERT" <<<"$certs"; then
  run sudo certbot delete --non-interactive --cert-name "$CERT"
fi

# 6. App directory (data, backups, .env)
run sudo rm -rf "$DIR"

echo "done."

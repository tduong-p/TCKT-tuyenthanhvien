#!/usr/bin/env bash
# Remove the interview system from this host, leaving only a final backup in $HOME.
#   ./uninstall.sh --dry-run   print what would run
#   ./uninstall.sh             ask for confirmation, then run
# Touches only: /opt/interview, the "interview" compose project and its images,
# the "# interview-backup" crontab line, nginx site interview.conf, certbot cert "interview".
set -euo pipefail

DIR=/opt/interview
SITE=interview.conf
CERT=interview
DRY=0
[[ "${1:-}" == "--dry-run" ]] && DRY=1

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
  if [[ $DRY -eq 1 ]] || docker compose ps --status running --services 2>/dev/null | grep -qx mongo; then
    run ./backup.sh --keep 1000
    if [[ $DRY -eq 0 ]]; then
      latest=$(ls -1t backups/interview-*.archive.gz | head -1)
      cp "$latest" "$final"
      echo "final backup: $final"
    else
      echo "+ cp <latest backup> $final"
    fi
  else
    echo "mongo is not running - skipping final backup (existing dumps: $DIR/backups)"
  fi
  # 2. Containers, network and images of this project only
  run docker compose down -v --rmi all
  cd /
fi

# 3. Backup cron line
if crontab -l 2>/dev/null | grep -q '# interview-backup'; then
  echo "+ crontab: remove line tagged # interview-backup"
  if [[ $DRY -eq 0 ]]; then crontab -l | grep -v '# interview-backup' | crontab -; fi
fi

# 4. nginx site
if [[ -e /etc/nginx/sites-enabled/$SITE || -e /etc/nginx/sites-available/$SITE || $DRY -eq 1 ]]; then
  run sudo rm -f "/etc/nginx/sites-enabled/$SITE" "/etc/nginx/sites-available/$SITE"
  run sudo nginx -t
  run sudo systemctl reload nginx
fi

# 5. TLS certificate (only ours, not the shared one)
if [[ $DRY -eq 1 ]] || sudo certbot certificates --cert-name "$CERT" 2>/dev/null | grep -q "Certificate Name: $CERT"; then
  run sudo certbot delete --non-interactive --cert-name "$CERT"
fi

# 6. App directory (data, backups, .env)
run sudo rm -rf "$DIR"

echo "done."

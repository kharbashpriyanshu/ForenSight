#!/bin/sh
set -eu
umask 077

backup_interval=${BACKUP_INTERVAL_SECONDS:-86400}
retention_days=${BACKUP_RETENTION_DAYS:-30}
backup_root=${BACKUP_ROOT:-/backups}
case "$backup_interval" in ''|*[!0-9]*) echo "BACKUP_INTERVAL_SECONDS must be an integer" >&2; exit 2 ;; esac
case "$retention_days" in ''|*[!0-9]*) echo "BACKUP_RETENTION_DAYS must be an integer" >&2; exit 2 ;; esac
if [ "$backup_interval" -lt 60 ] || [ "$retention_days" -lt 1 ]; then
  echo "Backup interval must be at least 60 seconds and retention at least 1 day" >&2
  exit 2
fi

while :; do
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  mkdir -p "$backup_root"
  destination="$backup_root/$stamp"
  staging=$(mktemp -d "$backup_root/.staging-$stamp-XXXXXX")
  trap 'rm -rf -- "$staging"' EXIT HUP INT TERM

  echo "Creating ForenSight backup $stamp"
  pg_dump --format=custom --no-owner --no-acl --file="$staging/database.dump"
  tar -czf "$staging/evidence.tar.gz" -C /evidence .
  printf 'created_at_utc=%s\npostgres_database=%s\nevidence_root=backend/storage\n' \
    "$stamp" "${PGDATABASE:-}" > "$staging/README.txt"
  (cd "$staging" && sha256sum database.dump evidence.tar.gz README.txt > SHA256SUMS)

  pg_restore --list "$staging/database.dump" >/dev/null
  tar -tzf "$staging/evidence.tar.gz" >/dev/null
  (cd "$staging" && sha256sum -c SHA256SUMS)
  printf 'verified_at_utc=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$staging/VERIFIED"

  if [ -e "$destination" ]; then
    destination="/backups/${stamp}-$(date -u +%s)"
  fi
  mv "$staging" "$destination"
  trap - EXIT HUP INT TERM
  echo "Backup complete: $destination"

  find "$backup_root" -mindepth 1 -maxdepth 1 -type d -name '20??????T??????Z' \
    -mtime "+$retention_days" -exec rm -rf -- {} +
  sleep "$backup_interval"
done

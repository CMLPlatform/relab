#!/bin/sh
# spell-checker: ignore crond, crontabs
# Entrypoint script for user uploads backup service. To be used in Alpine-based Docker container.
#
# Runs as root so it can fix ownership on the bind-mounted backup directory, then
# schedules the backup script to run as the unprivileged backupuser via su-exec.

set -e

BACKUP_USER="${BACKUP_USER:-backupuser}"
UPLOADS_BACKUP_DIR="${UPLOADS_BACKUP_DIR:-/backups}"
SCHEDULE="${SCHEDULE:-0 2 * * *}"
BACKUP_SCRIPT="${BACKUP_SCRIPT:-./backup_user_uploads.sh}"

# Ensure the backup dir exists and is writable by backupuser. Docker auto-creates
# missing bind-mount paths as root, so we normalize ownership here.
mkdir -p "${UPLOADS_BACKUP_DIR}"
chown -R "${BACKUP_USER}:${BACKUP_USER}" "${UPLOADS_BACKUP_DIR}"

# Write the backup schedule to root's crontab; the job drops privileges via su-exec.
echo "${SCHEDULE} su-exec ${BACKUP_USER} ${BACKUP_SCRIPT} >> /proc/1/fd/1 2>&1" > /etc/crontabs/root

echo "[$(date)] User uploads backup service started. Schedule: ${SCHEDULE}"

# Start cron in foreground (crond itself must run as root).
exec crond -f -l 2

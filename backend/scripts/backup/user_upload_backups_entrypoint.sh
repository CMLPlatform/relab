#!/bin/sh
# Entrypoint script for user uploads backup service. To be used in Alpine-based Docker container.
set -e

# Create backup directory
mkdir -p "${BACKUP_DIR:-/backups}"

# Write the backup schedule to the crontab.
echo "${SCHEDULE-:'0 2 * * *'} ${BACKUP_SCRIPT:-./backup_user_uploads.sh} >> /proc/1/fd/1 2>&1" > /etc/crontabs/"${USER:-root}"

echo "[$(date)] User uploads backup service started. Schedule: ${SCHEDULE:-'0 2 * * *'}"

# Start cron in foreground
exec crond -f -l 2

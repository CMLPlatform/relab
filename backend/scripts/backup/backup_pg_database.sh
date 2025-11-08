#!/bin/sh
### Simple script to backup the postgres database manually
set -e

# Load backend and root .env files
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PG_ENV_FILE="$SCRIPT_DIR/../../.env"
ROOT_ENV_FILE="$SCRIPT_DIR/../../../.env"

if [ -f "$PG_ENV_FILE" ]; then
    . "$PG_ENV_FILE"
    echo "[$(date)] Loaded backend env file: $PG_ENV_FILE"
else
    echo "[$(date)] ERROR: Backend env file not found at $PG_ENV_FILE. Aborting."
    exit 1
fi

if [ -f "$ROOT_ENV_FILE" ]; then
    . "$ROOT_ENV_FILE"
    echo "[$(date)] Loaded root env file: $ROOT_ENV_FILE"
else
    echo "[$(date)] INFO: Root env file not found at $ROOT_ENV_FILE. Skipping."
fi

# Configuration
BACKUP_DIR_PG="${BACKUP_DIR:-$SCRIPT_DIR/../../backups}/postgres_db/manual"
DATABASE_HOST="${DATABASE_HOST:-localhost}"
DATABASE_PORT="${DATABASE_PORT:-5432}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD not set}"
POSTGRES_DB="${POSTGRES_DB:?POSTGRES_DB not set}"

COMPRESSION="${POSTGRES_COMPRESSION:-zstd:3}"
SCHEMA="${POSTGRES_SCHEMA:-public}"
FILENAME="${POSTGRES_DB}-$(date +%Y%m%d-%H%M%S).sql.zst"

# Wait for PostgreSQL
echo "[$(date)] Waiting for PostgreSQL..."
for i in $(seq 1 10); do
    if PGPASSWORD="$POSTGRES_PASSWORD" pg_isready -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U "$POSTGRES_USER" -q; then
        echo "[$(date)] PostgreSQL ready"
        break
    fi
    [ "$i" -eq 10 ] && { echo "[$(date)] ERROR: PostgreSQL timeout"; exit 1; }
    sleep 2
done

echo "Successfully connected to PostgreSQL."

# Perform backup
mkdir -p "$BACKUP_DIR_PG"
echo "[$(date)] Backing up '$POSTGRES_DB' to $BACKUP_DIR_PG/$FILENAME"

PGPASSWORD="$POSTGRES_PASSWORD" pg_dump \
    -h "$DATABASE_HOST" \
    -p "$DATABASE_PORT" \
    -U "$POSTGRES_USER" \
    --compress="$COMPRESSION" \
    --schema="$SCHEMA" \
    "$POSTGRES_DB" \
    > "$BACKUP_DIR_PG/$FILENAME"

echo "[$(date)] Backup completed. Size: $(du -h "$BACKUP_DIR_PG/$FILENAME" | cut -f1)"

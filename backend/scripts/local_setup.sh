#!/usr/bin/env bash
# This script sets up the local development environment for the backend.

# spell-checker: ignore direnv envrc

# Exit immediately if a command exits with a non-zero status
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# Resolve backend directory (one level up from `scripts`)
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

require_env() {
    local name
    for name in "$@"; do
        if [[ -z "${!name:-}" ]]; then
            echo "$name must be exported before running this script." >&2
            echo "Use direnv with backend/.envrc.example, or export values from backend/.env.dev manually." >&2
            exit 1
        fi
    done
}

read_secret() {
    local env="${ENVIRONMENT:-dev}"
    local env_name="$1"
    local file_name="$2"
    local file_path

    for file_path in "/run/secrets/$file_name" "$BACKEND_DIR/../secrets/$env/$file_name"; do
        if [[ -f "$file_path" ]]; then
            tr -d '\n' <"$file_path"
            return
        fi
    done

    printf '%s' "${!env_name:-}"
}

echo "Running local setup script from $SCRIPT_DIR"
echo "Backend directory: $BACKEND_DIR"

echo "Setting up local development environment..."

require_env DATABASE_HOST POSTGRES_USER POSTGRES_DB

# Set PGPASSWORD for non-interactive authentication with PostgreSQL
PGPASSWORD="$(read_secret POSTGRES_PASSWORD postgres_password)"
if [[ -z "$PGPASSWORD" ]]; then
    echo "POSTGRES_PASSWORD must be set in /run/secrets/postgres_password, ../secrets/${ENVIRONMENT:-dev}/postgres_password, or the environment." >&2
    exit 1
fi
export PGPASSWORD

MAX_RETRIES=10
RETRY_COUNT=0

until pg_isready -h "$DATABASE_HOST" >/dev/null 2>&1; do
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo "Waiting for PostgreSQL at $DATABASE_HOST... (attempt $RETRY_COUNT/$MAX_RETRIES)"
    if [ "$RETRY_COUNT" -ge "$MAX_RETRIES" ]; then
        echo "Could not connect to PostgreSQL at $DATABASE_HOST after $MAX_RETRIES attempts. Access was tried but not found."
        exit 1
    fi
    sleep 2
done

# Try connecting as POSTGRES_USER
if psql -h "$DATABASE_HOST" -U "$POSTGRES_USER" -d postgres -c '\q' 2>/dev/null; then
    echo "Successfully connected as $POSTGRES_USER."
else
    echo "Could not connect as $POSTGRES_USER. Please ensure this user exists and has access."
    exit 1
fi

echo "Checking if the PostgreSQL database exists..."
if psql -h "$DATABASE_HOST" -U "$POSTGRES_USER" -lqt | cut -d \| -f 1 | grep -qw "$POSTGRES_DB"; then
    echo "Database exists."
else
    echo "Database does not exist. Creating..."
    createdb -h "$DATABASE_HOST" -U "$POSTGRES_USER" "$POSTGRES_DB"
fi

# Run Alembic migrations
echo "Checking current Alembic migration status..."
uv run alembic current

echo "Upgrading database to the latest revision..."
uv run alembic upgrade head

# Check if all tables are empty
echo "Checking if all tables in the database are empty using scripts/db/is_empty.py..."

if uv run python -m scripts.db.is_empty --quiet; then
    echo "All tables are empty, proceeding to seed dummy data..."
    uv run python -m scripts.seed.dummy_data
else
    status=$?
    if [ "$status" -eq 10 ]; then
        echo "Database already has data, skipping seeding."
    else
        echo "Failed to determine whether the database is empty."
        exit "$status"
    fi
fi

# Create a superuser if the required environment variables are set
echo "Creating a superuser..."
uv run -m scripts.users.create_superuser

echo "Local setup complete."

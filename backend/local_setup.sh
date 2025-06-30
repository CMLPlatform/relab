#!/usr/bin/env bash
# Exit immediately if a command exits with a non-zero status
set -e

# Check if .env file exists, if not, prompt the user and exit
if [ ! -f ".env" ]; then
    echo ".env not found. Please create it by copying from .env.example:"
    echo "cp .env.example .env"
    exit 1
fi

echo "Setting up local development environment..."

# Load database environment variables from .env file
eval "$(command grep -E "^(DATABASE_HOST|DATABASE_PORT|POSTGRES_USER|POSTGRES_PASSWORD|POSTGRES_DB)=" .env)"

# Check if the PostgreSQL database exists, if not, create it
until pg_isready -h "$DATABASE_HOST" -U "$POSTGRES_USER" >/dev/null 2>&1; do
    echo "Waiting for PostgreSQL to be ready..."
    sleep 2
done

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
echo "Checking if all tables in the database are empty using scripts/check_db_empty.py..."

set +e
uv run python -m scripts.check_db_empty
DB_EMPTY=$?
set -e

if [ "$DB_EMPTY" -eq "0" ]; then
    echo "All tables are empty, proceeding to seed dummy data..."
    uv run python -m scripts.seed.dummy_data
else
    echo "Database already has data, skipping seeding."
fi

# Create a superuser if the required environment variables are set
echo "Creating a superuser..."
uv run -m scripts.create_superuser

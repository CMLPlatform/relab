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
set -a
eval "$(command grep -E "^(DATABASE_HOST|DATABASE_PORT|POSTGRES_USER|POSTGRES_PASSWORD|POSTGRES_DB)=" .env)"
set +a

# Check if the PostgreSQL database exists, if not, create it
until pg_isready -h "$DATABASE_HOST" >/dev/null 2>&1; do
    echo "Waiting for PostgreSQL to be ready..."
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
echo "Checking if all tables in the database are empty using scripts/db_is_empty.py..."

# Run the script and temporarily disable exit-on-error to capture the exit code
DB_EMPTY=$(.venv/bin/python -m scripts.db_is_empty)

if [ "$DB_EMPTY" = "TRUE" ]; then
    echo "All tables are empty, proceeding to seed dummy data..."
    .venv/bin/python -m scripts.seed.dummy_data
else
    echo "Database already has data, skipping seeding."
fi

# Create a superuser if the required environment variables are set
echo "Creating a superuser..."
uv run -m scripts.create_superuser

# Activate the virtual environment
echo "Activating the virtual environment..."
source .venv/bin/activate

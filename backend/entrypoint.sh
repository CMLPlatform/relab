#!/usr/bin/env sh

# Exit immediately if a command exits with a non-zero status
set -e

# Run Alembic migrations
if [ "$DEBUG" = "True" ]; then
    echo "Current migration status:"
    .venv/bin/alembic current
fi

echo "Upgrading database to the latest revision..."
.venv/bin/alembic upgrade head

# Check if all tables are empty
echo "Checking if all tables in the database are empty using scripts/check_db_empty.py..."

# Run the script and temporarily disable exit-on-error
set +e
.venv/bin/python -m scripts.check_db_empty
DB_EMPTY=$?
set -e

if [ "$DB_EMPTY" -eq "0" ]; then
    echo "All tables are empty, proceeding to seed dummy data..."
    .venv/bin/python -m scripts.seed.dummy_data
else
    echo "Database already has data, skipping seeding."
fi

# Create a superuser if the required environment variables are set
echo "Creating a superuser..."
.venv/bin/python -m scripts.create_superuser

# Start the server or other desired commands
exec "$@"

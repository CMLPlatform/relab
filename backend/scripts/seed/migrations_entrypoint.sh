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

# Check if we should seed taxonomies
if [ "$SEED_TAXONOMIES" = "true" ]; then
    echo "Seeding taxonomies..."
    .venv/bin/python -m scripts.seed.taxonomies.cpv
    .venv/bin/python -m scripts.seed.taxonomies.harmonized_system
fi

# Check if we should seed product types
if [ "$SEED_PRODUCT_TYPES" = "true" ]; then
    echo "Seeding product types..."
    .venv/bin/python -m scripts.seed.taxonomies.cpv --seed-product-types

fi

# Check if all tables are empty
echo "Checking if all tables in the database are empty using scripts/db_is_empty.py..."

# Run the script and temporarily disable exit-on-error to capture the exit code
DB_EMPTY=$(.venv/bin/python -m scripts.db_is_empty)

if [ "$DB_EMPTY" = "TRUE" ] && [ "$SEED_DUMMY_DATA" = "true" ]; then
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

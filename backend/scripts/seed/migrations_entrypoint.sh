#!/usr/bin/env sh

# Exit immediately if a command exits with a non-zero status
set -e

# Helper to lowercase a value (POSIX)
lc() { echo "$1" | tr '[:upper:]' '[:lower:]'; }

# Defaults (so missing env vars behave as "false")
SEED_CPV_CATEGORIES="${SEED_CPV_CATEGORIES:-false}"
SEED_CPV_PRODUCT_TYPES="${SEED_CPV_PRODUCT_TYPES:-false}"
SEED_HS_CATEGORIES="${SEED_HS_CATEGORIES:-false}"
SEED_DUMMY_DATA="${SEED_DUMMY_DATA:-false}"
DEBUG="${DEBUG:-false}"

require_taxonomy_seed_deps() {
    if ! .venv/bin/python -c "import pandas, requests" >/dev/null 2>&1; then
        echo "Taxonomy seeding requires the optional seed-taxonomies dependency group." >&2
        echo "Rebuild backend/Dockerfile.migrations with INCLUDE_TAXONOMY_SEED_DEPS=true to enable SEED_CPV_* or SEED_HS_CATEGORIES." >&2
        exit 1
    fi
}

# Run Alembic migrations
if [ "$(lc "$DEBUG")" = "true" ]; then
    echo "Current migration status:"
    .venv/bin/alembic current
fi

echo "Upgrading database to the latest revision..."
.venv/bin/alembic upgrade head

# Seed dummy data if enabled and if the database is empty
if [ "$(lc "$SEED_DUMMY_DATA")" = "true" ]; then
    echo "Dummy data seeding is enabled."
    echo "Checking if all tables in the database are empty using scripts/db_is_empty.py..."

    if .venv/bin/python -m scripts.db_is_empty --quiet; then
        echo "All tables are empty, proceeding to seed dummy data..."
        .venv/bin/python -m scripts.seed.dummy_data
    else
        status=$?
        if [ "$status" -eq 10 ]; then
            echo "Database already has data, skipping seeding of dummy data."
        else
            echo "Failed to determine whether the database is empty." >&2
            exit "$status"
        fi
    fi
else
    echo "Dummy data seeding is disabled."
fi

# Seed taxonomies: run cpv once and pass the product-types flag if requested
if [ "$(lc "$SEED_CPV_CATEGORIES")" = "true" ]; then
    require_taxonomy_seed_deps
    echo "Seeding CPV categories..."
    if [ "$(lc "$SEED_CPV_PRODUCT_TYPES")" = "true" ]; then
        .venv/bin/python -m scripts.seed.taxonomies.cpv --seed-product-types
    else
        .venv/bin/python -m scripts.seed.taxonomies.cpv
    fi
elif [ "$(lc "$SEED_CPV_PRODUCT_TYPES")" = "true" ]; then
    echo "SEED_CPV_PRODUCT_TYPES is true but SEED_CPV_CATEGORIES is not true. Skipping seeding of CPV product types since categories are required."
fi

if [ "$(lc "$SEED_HS_CATEGORIES")" = "true" ]; then
    require_taxonomy_seed_deps
    .venv/bin/python -m scripts.seed.taxonomies.harmonized_system
fi

# Create a superuser if the required environment variables are set
echo "Creating a superuser..."
.venv/bin/python -m scripts.create_superuser

# Start the server or other desired commands
exec "$@"

#!/usr/bin/env bash
# spell-checker: ignore EOSQL

set -euo pipefail

# Enable pg_stat_statements so slow and unindexed queries can be identified.
# shared_preload_libraries must include 'pg_stat_statements' — set via -c flags
# in the postgres service command in compose.yaml (the official image has no env var for this).
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
EOSQL

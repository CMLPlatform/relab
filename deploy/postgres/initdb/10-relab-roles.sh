#!/usr/bin/env bash

# spell-checker: ignore NOREPLICATION

set -euo pipefail

read_secret() {
    local name="$1"
    local file_name="${name}_FILE"
    local value="${!name:-}"
    local file_value="${!file_name:-}"

    if [[ -n "$value" && -n "$file_value" ]]; then
        echo "Both $name and $file_name are set; use only one." >&2
        exit 1
    fi
    if [[ -n "$file_value" ]]; then
        if [[ ! -f "$file_value" ]]; then
            echo "Secret file for $name does not exist: $file_value" >&2
            exit 1
        fi
        value="$(<"$file_value")"
    fi
    if [[ -z "$value" ]]; then
        echo "$name must be set for RELab Postgres role initialization." >&2
        exit 1
    fi
    printf '%s' "$value"
}

DATABASE_APP_USER="${DATABASE_APP_USER:?DATABASE_APP_USER must be set}"
DATABASE_MIGRATION_USER="${DATABASE_MIGRATION_USER:?DATABASE_MIGRATION_USER must be set}"
DATABASE_BACKUP_USER="${DATABASE_BACKUP_USER:?DATABASE_BACKUP_USER must be set}"

DATABASE_APP_PASSWORD="$(read_secret DATABASE_APP_PASSWORD)"
DATABASE_MIGRATION_PASSWORD="$(read_secret DATABASE_MIGRATION_PASSWORD)"
DATABASE_BACKUP_PASSWORD="$(read_secret DATABASE_BACKUP_PASSWORD)"

psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
    --set=ON_ERROR_STOP=1 \
    --set=app_user="$DATABASE_APP_USER" \
    --set=app_password="$DATABASE_APP_PASSWORD" \
    --set=migration_user="$DATABASE_MIGRATION_USER" \
    --set=migration_password="$DATABASE_MIGRATION_PASSWORD" \
    --set=backup_user="$DATABASE_BACKUP_USER" \
    --set=backup_password="$DATABASE_BACKUP_PASSWORD" <<'SQL'
SELECT format(
    'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION',
    :'migration_user',
    :'migration_password'
)
\gexec
SELECT format(
    'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION',
    :'app_user',
    :'app_password'
)
\gexec
SELECT format(
    'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION',
    :'backup_user',
    :'backup_password'
)
\gexec

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', current_database()) \gexec

SELECT format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), :'migration_user') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), :'app_user') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), :'backup_user') \gexec
SELECT format('GRANT CREATE ON DATABASE %I TO %I', current_database(), :'migration_user') \gexec

SELECT format('GRANT USAGE, CREATE ON SCHEMA public TO %I', :'migration_user') \gexec
SELECT format('GRANT USAGE ON SCHEMA public TO %I', :'app_user') \gexec
SELECT format('GRANT USAGE ON SCHEMA public TO %I', :'backup_user') \gexec
SELECT format('GRANT pg_read_all_data TO %I', :'backup_user') \gexec

SELECT format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I',
    :'migration_user',
    :'app_user'
)
\gexec
SELECT format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO %I',
    :'migration_user',
    :'app_user'
)
\gexec
SELECT format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT ON TABLES TO %I',
    :'migration_user',
    :'backup_user'
)
\gexec
SELECT format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT ON SEQUENCES TO %I',
    :'migration_user',
    :'backup_user'
)
\gexec

SELECT format('ALTER ROLE %I SET search_path = public, pg_catalog', :'migration_user') \gexec
SELECT format('ALTER ROLE %I SET search_path = public, pg_catalog', :'app_user') \gexec
SELECT format('ALTER ROLE %I SET search_path = public, pg_catalog', :'backup_user') \gexec
SELECT format('ALTER ROLE %I SET statement_timeout = %L', :'app_user', '30s') \gexec
SELECT format('ALTER ROLE %I SET lock_timeout = %L', :'app_user', '5s') \gexec
SELECT format('ALTER ROLE %I SET idle_in_transaction_session_timeout = %L', :'app_user', '60s') \gexec
SQL

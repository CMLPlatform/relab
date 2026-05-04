"""One-time migration from prod plaintext encrypted fields to AES-256-GCM.

Run before deploying runtime code that only accepts ``relab:v2:aesgcm:`` values:

    python -m scripts.maintenance.migrate_encryption_v1_to_v2 --dry-run
    python -m scripts.maintenance.migrate_encryption_v1_to_v2

Required environment:
- ``DATA_ENCRYPTION_KEY``: new base64url AES-256-GCM key.
- database connection values, including ``DATABASE_APP_PASSWORD`` or its file
  fallback from ``DATABASE_APP_PASSWORD_FILE`` / ``/run/secrets/database_app_password``.
"""
# spell-checker: ignore aesgcm, conninfo


from __future__ import annotations

import argparse
import base64
import logging
import os
import secrets
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING

import psycopg
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.core.crypto.keys import decode_data_encryption_key

if TYPE_CHECKING:
    from collections.abc import Sequence

logger = logging.getLogger(__name__)

V2_PREFIX = "relab:v2:aesgcm:"
AESGCM_NONCE_BYTES = 12
DEFAULT_BATCH_SIZE = 200

TARGETS = (
    ("oauthaccount", "id", ("access_token", "refresh_token")),
    ("recording_session", "id", ("broadcast_key",)),
)


class MigrationError(RuntimeError):
    """Raised when encrypted data cannot be migrated safely."""


@dataclass(frozen=True, slots=True)
class MigrationStats:
    """Count migrated and skipped encrypted fields."""

    migrated: int = 0
    skipped: int = 0

    def __add__(self, other: MigrationStats) -> MigrationStats:
        """Combine migration counts."""
        return MigrationStats(migrated=self.migrated + other.migrated, skipped=self.skipped + other.skipped)


def get_env_secret(name: str) -> str:
    """Return a secret from an env var, explicit *_FILE, or Docker secret file."""
    if value := os.environ.get(name):
        return value

    file_path = os.environ.get(f"{name}_FILE")
    default_file_path = Path("/run/secrets") / name.lower()
    if not file_path and default_file_path.exists():
        file_path = str(default_file_path)

    if not file_path:
        return ""

    return Path(file_path).read_text(encoding="utf-8").strip()


def load_aesgcm(key_raw: str) -> AESGCM:
    """Load the new AES-256-GCM key."""
    try:
        key_bytes = decode_data_encryption_key(key_raw)
    except ValueError as exc:
        msg = str(exc)
        raise ValueError(msg) from exc
    return AESGCM(key_bytes)


def encrypt_v2(aesgcm: AESGCM, plaintext: str) -> str:
    """Encrypt one plaintext value with the new AES-GCM storage format."""
    nonce = secrets.token_bytes(AESGCM_NONCE_BYTES)
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
    token = base64.urlsafe_b64encode(nonce + ciphertext).rstrip(b"=").decode("ascii")
    return f"{V2_PREFIX}{token}"


def migrate_value(value: str | None, aesgcm: AESGCM) -> str | None:
    """Return the migrated value, or None when the field should be skipped."""
    if value is None or value.startswith(V2_PREFIX):
        return None
    return encrypt_v2(aesgcm, value)


def migrate_table(
    conn: psycopg.Connection,
    table: str,
    pk_col: str,
    enc_cols: Sequence[str],
    aesgcm: AESGCM,
    *,
    dry_run: bool,
    batch_size: int,
) -> MigrationStats:
    """Migrate one table and return migrated/skipped field counts."""
    migrated = skipped = 0
    cols_sql = ", ".join([pk_col, *enc_cols])
    unmigrated_clauses = " OR ".join(f"({col} IS NOT NULL AND {col} NOT LIKE %s)" for col in enc_cols)
    v2_pattern = f"{V2_PREFIX}%"

    with conn.cursor() as cur:
        cur.execute(
            f"SELECT {cols_sql} FROM {table} WHERE {unmigrated_clauses}",  # noqa: S608
            [v2_pattern] * len(enc_cols),
        )
        rows = cur.fetchmany(batch_size)

        while rows:
            for row in rows:
                pk = row[0]
                values = row[1:]
                updates: dict[str, str] = {}

                for col, val in zip(enc_cols, values, strict=True):
                    try:
                        migrated_value = migrate_value(val, aesgcm)
                    except MigrationError as exc:
                        msg = f"{table}.{col} pk={pk}: {exc}"
                        raise MigrationError(msg) from exc

                    if migrated_value is None:
                        skipped += 1
                        continue
                    updates[col] = migrated_value

                if not updates:
                    continue

                set_clause = ", ".join(f"{col} = %s" for col in updates)
                if not dry_run:
                    with conn.cursor() as upd:
                        upd.execute(
                            f"UPDATE {table} SET {set_clause} WHERE {pk_col} = %s",  # noqa: S608
                            [*updates.values(), pk],
                        )
                migrated += len(updates)

            if not dry_run:
                conn.commit()
            rows = cur.fetchmany(batch_size)

    return MigrationStats(migrated=migrated, skipped=skipped)


def build_conninfo() -> str:
    """Build a psycopg connection string from deploy environment variables."""
    return psycopg.conninfo.make_conninfo(
        host=os.environ.get("DATABASE_HOST", "localhost"),
        port=int(os.environ.get("DATABASE_PORT", "5432")),
        dbname=os.environ.get("POSTGRES_DB", "relab_db"),
        user=os.environ.get("DATABASE_APP_USER", "relab_app"),
        password=get_env_secret("DATABASE_APP_PASSWORD"),
    )


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="Print what would change without writing.")
    parser.add_argument(
        "--batch-size",
        type=int,
        default=DEFAULT_BATCH_SIZE,
        metavar="N",
        help=f"Rows fetched per batch (default {DEFAULT_BATCH_SIZE}).",
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    """Run the one-time encryption migration."""
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    args = parse_args(argv)

    new_key = os.environ.get("DATA_ENCRYPTION_KEY", "")
    if not new_key:
        logger.error("DATA_ENCRYPTION_KEY env var is required (new AES-256-GCM key).")
        return 1

    try:
        aesgcm = load_aesgcm(new_key)
        conninfo = build_conninfo()
        mode = "DRY RUN - no writes" if args.dry_run else "LIVE"
        logger.info("Migration starting [%s]", mode)

        total = MigrationStats()
        with psycopg.connect(conninfo, autocommit=False) as conn:
            for table, pk_col, enc_cols in TARGETS:
                stats = migrate_table(
                    conn,
                    table,
                    pk_col,
                    enc_cols,
                    aesgcm,
                    dry_run=args.dry_run,
                    batch_size=args.batch_size,
                )
                logger.info("%s migrated=%s skipped=%s", table, stats.migrated, stats.skipped)
                total += stats
    except MigrationError, OSError, ValueError, psycopg.Error:
        logger.exception("Migration failed")
        return 1

    logger.info("Done. total migrated=%s skipped=%s", total.migrated, total.skipped)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

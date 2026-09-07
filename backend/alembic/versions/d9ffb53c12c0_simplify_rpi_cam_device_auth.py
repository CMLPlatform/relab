"""simplify rpi cam device auth

Revision ID: d9ffb53c12c0
Revises: cb66f26a9893
Create Date: 2026-04-13 16:34:01.731636

"""

import os
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "d9ffb53c12c0"
down_revision: str | None = "cb66f26a9893"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

DROP_CAMERAS_ENV = "ALEMBIC_D9FFB53C12C0_DROP_CAMERAS"
OPT_IN = "true"


def _clear_cameras(direction: str) -> None:
    """Empty ``camera``, refusing to destroy rows unless the operator opted in.

    This revision is already applied everywhere it matters, so in practice the table is
    empty and this is a no-op. It only bites on a replay -- migrating a restored backup --
    where silently deleting every paired device would be data loss, not a migration.
    """
    connection = op.get_bind()
    row_count = connection.execute(sa.text("SELECT count(*) FROM camera")).scalar_one()
    if row_count and os.environ.get(DROP_CAMERAS_ENV) != OPT_IN:
        msg = (
            f"Refusing to {direction} d9ffb53c12c0: it deletes all {row_count} camera row(s), whose legacy "
            "shared-key credentials cannot be converted to asymmetric device credentials. Re-pair the devices "
            f"afterwards. Set {DROP_CAMERAS_ENV}=true to proceed."
        )
        raise RuntimeError(msg)
    op.execute("DELETE FROM camera")


def upgrade() -> None:
    # Existing RPi camera rows used legacy shared-key HTTP/WebSocket credentials
    # that cannot be transformed into asymmetric device credentials.
    _clear_cameras("upgrade")

    sa.Enum("ACTIVE", "REVOKED", name="cameracredentialstatus").create(op.get_bind())
    op.add_column("camera", sa.Column("relay_public_key_jwk", postgresql.JSONB(astext_type=sa.Text()), nullable=False))
    op.add_column("camera", sa.Column("relay_key_id", sa.String(length=64), nullable=False))
    op.add_column(
        "camera",
        sa.Column(
            "relay_credential_status",
            postgresql.ENUM("ACTIVE", "REVOKED", name="cameracredentialstatus", create_type=False),
            server_default="ACTIVE",
            nullable=False,
        ),
    )
    op.add_column("camera", sa.Column("relay_last_seen_at", sa.DateTime(timezone=True), nullable=True))
    op.drop_column("camera", "url")
    op.drop_column("camera", "encrypted_auth_headers")
    op.drop_column("camera", "encrypted_api_key")
    op.drop_column("camera", "connection_mode")
    sa.Enum("HTTP", "WEBSOCKET", name="connectionmode").drop(op.get_bind())


def downgrade() -> None:
    _clear_cameras("downgrade")

    sa.Enum("HTTP", "WEBSOCKET", name="connectionmode").create(op.get_bind())
    op.add_column(
        "camera",
        sa.Column(
            "connection_mode",
            postgresql.ENUM("HTTP", "WEBSOCKET", name="connectionmode", create_type=False),
            server_default=sa.text("'HTTP'::connectionmode"),
            nullable=False,
        ),
    )
    op.add_column("camera", sa.Column("encrypted_api_key", sa.VARCHAR(), nullable=False))
    op.add_column("camera", sa.Column("encrypted_auth_headers", sa.VARCHAR(), nullable=True))
    op.add_column("camera", sa.Column("url", sa.VARCHAR(), nullable=True))
    op.drop_column("camera", "relay_last_seen_at")
    op.drop_column("camera", "relay_credential_status")
    op.drop_column("camera", "relay_key_id")
    op.drop_column("camera", "relay_public_key_jwk")
    sa.Enum("ACTIVE", "REVOKED", name="cameracredentialstatus").drop(op.get_bind())

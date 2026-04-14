"""simplify rpi cam device auth

Revision ID: d9ffb53c12c0
Revises: cb66f26a9893
Create Date: 2026-04-13 16:34:01.731636

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "d9ffb53c12c0"
down_revision: str | None = "cb66f26a9893"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Existing RPi camera rows used legacy shared-key HTTP/WebSocket credentials
    # that cannot be transformed into asymmetric device credentials.
    op.execute("DELETE FROM camera")

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
    op.execute("DELETE FROM camera")

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

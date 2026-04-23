"""add recording session backstop

Revision ID: 6f2b9e4a1c3d
Revises: 4d379aaa416a
Create Date: 2026-04-15 13:10:00.000000

"""
# spell-checker: ignore astext, ondelete

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "6f2b9e4a1c3d"
down_revision: str | None = "4d379aaa416a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "recording_session",
        sa.Column("camera_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=False),
        sa.Column("stream_url", sa.String(), nullable=False),
        sa.Column("broadcast_key", sa.String(), nullable=False),
        sa.Column("video_metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.ForeignKeyConstraint(["camera_id"], ["camera.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("camera_id"),
    )


def downgrade() -> None:
    op.drop_table("recording_session")

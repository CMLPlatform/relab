"""add video id to recording session

Revision ID: 8b70d4c2f1a9
Revises: 7dd3d3d99191
Create Date: 2026-05-14 00:00:00.000000

"""

import os
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "8b70d4c2f1a9"
down_revision: str | None = "7dd3d3d99191"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

DROP_SESSIONS_ENV = "ALEMBIC_8B70D4C2F1A9_DROP_RECORDING_SESSIONS"
OPT_IN = "true"


def upgrade() -> None:
    # Pre-existing sessions describe a recording shape (stream_url, video_metadata) that has
    # no video row to point ``video_id`` at, so they cannot be carried forward. The count
    # check only bites on a replay against a restored backup; normally the table is empty.
    connection = op.get_bind()
    row_count = connection.execute(sa.text("SELECT count(*) FROM recording_session")).scalar_one()
    if row_count and os.environ.get(DROP_SESSIONS_ENV) != OPT_IN:
        msg = (
            f"Refusing to upgrade 8b70d4c2f1a9: it deletes all {row_count} recording_session row(s), which "
            f"predate the video_id foreign key and cannot be migrated. Set {DROP_SESSIONS_ENV}=true to proceed."
        )
        raise RuntimeError(msg)
    op.execute("DELETE FROM recording_session")
    op.add_column("recording_session", sa.Column("video_id", sa.Integer(), nullable=False))
    op.create_foreign_key(
        "fk_recording_session_video_id_video",
        "recording_session",
        "video",
        ["video_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.drop_column("recording_session", "video_metadata")
    op.drop_column("recording_session", "stream_url")
    op.drop_column("recording_session", "description")
    op.drop_column("recording_session", "title")
    op.drop_column("recording_session", "product_id")


def downgrade() -> None:
    op.add_column("recording_session", sa.Column("product_id", sa.Integer(), nullable=True))
    op.add_column("recording_session", sa.Column("title", sa.String(), nullable=True))
    op.add_column("recording_session", sa.Column("description", sa.String(), nullable=True))
    op.add_column("recording_session", sa.Column("stream_url", sa.String(), nullable=True))
    op.add_column("recording_session", sa.Column("video_metadata", sa.JSON(), nullable=True))
    op.drop_constraint("fk_recording_session_video_id_video", "recording_session", type_="foreignkey")
    op.drop_column("recording_session", "video_id")

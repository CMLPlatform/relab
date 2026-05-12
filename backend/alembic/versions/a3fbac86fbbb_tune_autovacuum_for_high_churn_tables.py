"""Tune autovacuum settings for high-churn tables.

Revision ID: a3fbac86fbbb
Revises: 7a6d4e8f9b10
Create Date: 2026-05-13 00:00:00.000000
"""
# spell-checker: ignore autovacuum

from collections.abc import Sequence

from alembic import op

revision: str = "a3fbac86fbbb"
down_revision: str | None = "7a6d4e8f9b10"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Vacuum at 5% dead tuples instead of the 20% default, and analyze at 2%.
    # This keeps bloat low on tables that see frequent inserts, updates, and deletes.
    # autovacuum_vacuum_cost_delay=2 on product reduces I/O throttling so vacuums finish faster.
    op.execute(
        """
        ALTER TABLE product SET (
            autovacuum_vacuum_scale_factor = 0.05,
            autovacuum_analyze_scale_factor = 0.02,
            autovacuum_vacuum_cost_delay = 2
        );
        ALTER TABLE image SET (
            autovacuum_vacuum_scale_factor = 0.05,
            autovacuum_analyze_scale_factor = 0.02
        );
        ALTER TABLE file SET (
            autovacuum_vacuum_scale_factor = 0.05,
            autovacuum_analyze_scale_factor = 0.02
        );
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE product RESET (
            autovacuum_vacuum_scale_factor,
            autovacuum_analyze_scale_factor,
            autovacuum_vacuum_cost_delay
        );
        ALTER TABLE image RESET (
            autovacuum_vacuum_scale_factor,
            autovacuum_analyze_scale_factor
        );
        ALTER TABLE file RESET (
            autovacuum_vacuum_scale_factor,
            autovacuum_analyze_scale_factor
        );
        """
    )

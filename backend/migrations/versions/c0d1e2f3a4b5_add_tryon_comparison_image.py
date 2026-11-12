"""Add aligned try-on comparison image path.

Revision ID: c0d1e2f3a4b5
Revises: b9d0e1f2a3b4
Create Date: 2026-08-13
"""

from collections.abc import Sequence

from alembic import op

revision: str = "c0d1e2f3a4b5"
down_revision: str | None = "b9d0e1f2a3b4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TABLE tryons ADD COLUMN IF NOT EXISTS comparison_image_path VARCHAR(500)")


def downgrade() -> None:
    op.execute("ALTER TABLE tryons DROP COLUMN IF EXISTS comparison_image_path")

"""Add saved native try-on photo path.

Revision ID: b9d0e1f2a3b4
Revises: a8c9d0e1f2b3
Create Date: 2026-08-13
"""

from collections.abc import Sequence

from alembic import op

revision: str = "b9d0e1f2a3b4"
down_revision: str | None = "a8c9d0e1f2b3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS tryon_person_image_path VARCHAR(500)")


def downgrade() -> None:
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS tryon_person_image_path")

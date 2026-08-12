"""Add optional gender profile field.

Revision ID: f7b8c9d0e1a2
Revises: e5f6a7b8c9d0
Create Date: 2026-08-12
"""

from collections.abc import Sequence

from alembic import op

revision: str = "f7b8c9d0e1a2"
down_revision: str | None = "e5f6a7b8c9d0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Old personal deployments used this column before official 1.7. IF NOT EXISTS
    # keeps their data intact while fresh official-based installs add it normally.
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS gender VARCHAR(30)")


def downgrade() -> None:
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS gender")

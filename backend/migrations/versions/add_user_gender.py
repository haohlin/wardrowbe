"""add gender to users

Revision ID: f6a7b8c9d0e1
Revises: e1f2g3h4i5j6
Create Date: 2026-05-09

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f6a7b8c9d0e1"
down_revision: str | None = "e1f2g3h4i5j6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("gender", sa.String(length=30), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "gender")

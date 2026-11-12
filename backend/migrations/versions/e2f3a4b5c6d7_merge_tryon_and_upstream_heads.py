"""Merge the try-on head with the upstream 1.13 head.

Revision ID: e2f3a4b5c6d7
Revises: a7d3c9e1f5b2, d1e2f3a4b5c6
Create Date: 2026-11-12
"""

from collections.abc import Sequence

revision: str = "e2f3a4b5c6d7"
down_revision: str | Sequence[str] | None = ("a7d3c9e1f5b2", "d1e2f3a4b5c6")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

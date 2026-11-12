"""Merge the try-on and AI retry migration heads.

Revision ID: d1e2f3a4b5c6
Revises: a9c8d7e6f5b4, c0d1e2f3a4b5
Create Date: 2026-11-12
"""

from collections.abc import Sequence

revision: str = "d1e2f3a4b5c6"
down_revision: str | Sequence[str] | None = ("a9c8d7e6f5b4", "c0d1e2f3a4b5")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

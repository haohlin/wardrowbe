"""Add native-compatible virtual try-on jobs.

Revision ID: a8c9d0e1f2b3
Revises: f7b8c9d0e1a2
Create Date: 2026-08-13
"""

from collections.abc import Sequence

from alembic import op

revision: str = "a8c9d0e1f2b3"
down_revision: str | None = "f7b8c9d0e1a2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        "DO $$ BEGIN CREATE TYPE tryon_status AS ENUM "
        "('pending', 'processing', 'completed', 'failed'); "
        "EXCEPTION WHEN duplicate_object THEN NULL; END $$"
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS tryons (
            id UUID PRIMARY KEY,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            outfit_id UUID NOT NULL REFERENCES outfits(id) ON DELETE CASCADE,
            status tryon_status NOT NULL DEFAULT 'pending',
            person_image_path VARCHAR(500) NOT NULL,
            result_image_path VARCHAR(500),
            model VARCHAR(255),
            job_id VARCHAR(255),
            error TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            completed_at TIMESTAMPTZ
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_tryons_user_id ON tryons (user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_tryons_outfit_id ON tryons (outfit_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_tryons_status ON tryons (status)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS tryons")
    op.execute("DROP TYPE IF EXISTS tryon_status")

"""Add evidence_blobs table for ephemeral container persistence.

Revision ID: 2b3c4d5e6f7a
Revises: 1a2b3c4d5e6f
Create Date: 2026-11-15 17:35:00.000000
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "2b3c4d5e6f7a"
down_revision: Union[str, Sequence[str], None] = "1a2b3c4d5e6f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()
    if "evidence_blobs" not in tables:
        op.create_table(
            "evidence_blobs",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("evidence_id", sa.Integer(), sa.ForeignKey("evidence.id", ondelete="CASCADE"), unique=True, nullable=False),
            sa.Column("file_data", sa.LargeBinary(), nullable=False),
            sa.Column("sha256_hash", sa.String(length=64), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("ix_evidence_blobs_id", "evidence_blobs", ["id"])
        op.create_index("ix_evidence_blobs_evidence_id", "evidence_blobs", ["evidence_id"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()
    if "evidence_blobs" in tables:
        op.drop_index("ix_evidence_blobs_evidence_id", table_name="evidence_blobs")
        op.drop_index("ix_evidence_blobs_id", table_name="evidence_blobs")
        op.drop_table("evidence_blobs")

"""Add engine version and execution progress fields to analysis jobs."""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f91d229aa401"
down_revision: Union[str, Sequence[str], None] = "c12d4902fe31"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("analysis_jobs", sa.Column("engine_version", sa.String(), nullable=False, server_default="1.0.0"))
    op.add_column("analysis_jobs", sa.Column("progress_percent", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("analysis_jobs", sa.Column("progress_message", sa.String(), nullable=True))
    op.add_column("analysis_jobs", sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"))


def downgrade() -> None:
    op.drop_column("analysis_jobs", "attempt_count")
    op.drop_column("analysis_jobs", "progress_message")
    op.drop_column("analysis_jobs", "progress_percent")
    op.drop_column("analysis_jobs", "engine_version")

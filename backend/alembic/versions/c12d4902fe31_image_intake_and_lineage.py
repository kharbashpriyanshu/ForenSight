"""Add investigation intake context and analyst-reviewed image links.

Revision ID: c12d4902fe31
Revises: aad6cb327d0d
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c12d4902fe31"
down_revision: Union[str, Sequence[str], None] = "aad6cb327d0d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "case_intake_contexts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("case_id", sa.Integer(), sa.ForeignKey("investigation_cases.id"), nullable=False, unique=True),
        sa.Column("claim_summary", sa.Text(), nullable=True),
        sa.Column("reported_event_date", sa.String(), nullable=True),
        sa.Column("reported_location", sa.Text(), nullable=True),
        sa.Column("source_reference_url", sa.Text(), nullable=True),
        sa.Column("intake_notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_case_intake_contexts_id", "case_intake_contexts", ["id"])
    op.create_index("ix_case_intake_contexts_case_id", "case_intake_contexts", ["case_id"])

    op.create_table(
        "evidence_intake_contexts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("evidence_id", sa.Integer(), sa.ForeignKey("evidence.id"), nullable=False, unique=True),
        sa.Column("source_platform", sa.String(), nullable=True),
        sa.Column("acquisition_method", sa.String(), nullable=True),
        sa.Column("received_from", sa.Text(), nullable=True),
        sa.Column("received_at", sa.String(), nullable=True),
        sa.Column("reported_capture_time", sa.String(), nullable=True),
        sa.Column("source_reference_url", sa.Text(), nullable=True),
        sa.Column("intake_notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_evidence_intake_contexts_id", "evidence_intake_contexts", ["id"])
    op.create_index("ix_evidence_intake_contexts_evidence_id", "evidence_intake_contexts", ["evidence_id"])

    op.create_table(
        "evidence_lineage_relations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("case_id", sa.Integer(), sa.ForeignKey("investigation_cases.id"), nullable=False),
        sa.Column("evidence_a_id", sa.Integer(), sa.ForeignKey("evidence.id"), nullable=False),
        sa.Column("evidence_b_id", sa.Integer(), sa.ForeignKey("evidence.id"), nullable=False),
        sa.Column("relation_kind", sa.String(), nullable=False),
        sa.Column("matching_details", sa.JSON(), nullable=False),
        sa.Column("review_status", sa.String(), nullable=False, server_default="CANDIDATE"),
        sa.Column("parent_evidence_id", sa.Integer(), sa.ForeignKey("evidence.id"), nullable=True),
        sa.Column("reviewer", sa.String(), nullable=True),
        sa.Column("review_note", sa.Text(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("evidence_a_id", "evidence_b_id", name="uq_lineage_evidence_pair"),
    )
    op.create_index("ix_evidence_lineage_relations_id", "evidence_lineage_relations", ["id"])
    op.create_index("ix_evidence_lineage_relations_case_id", "evidence_lineage_relations", ["case_id"])
    op.create_index("ix_evidence_lineage_relations_evidence_a_id", "evidence_lineage_relations", ["evidence_a_id"])
    op.create_index("ix_evidence_lineage_relations_evidence_b_id", "evidence_lineage_relations", ["evidence_b_id"])


def downgrade() -> None:
    op.drop_index("ix_evidence_lineage_relations_evidence_b_id", table_name="evidence_lineage_relations")
    op.drop_index("ix_evidence_lineage_relations_evidence_a_id", table_name="evidence_lineage_relations")
    op.drop_index("ix_evidence_lineage_relations_case_id", table_name="evidence_lineage_relations")
    op.drop_index("ix_evidence_lineage_relations_id", table_name="evidence_lineage_relations")
    op.drop_table("evidence_lineage_relations")
    op.drop_index("ix_evidence_intake_contexts_evidence_id", table_name="evidence_intake_contexts")
    op.drop_index("ix_evidence_intake_contexts_id", table_name="evidence_intake_contexts")
    op.drop_table("evidence_intake_contexts")
    op.drop_index("ix_case_intake_contexts_case_id", table_name="case_intake_contexts")
    op.drop_index("ix_case_intake_contexts_id", table_name="case_intake_contexts")
    op.drop_table("case_intake_contexts")

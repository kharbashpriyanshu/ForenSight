"""Add tamper-evident audit links and durable analysis dispatch records."""

import hashlib
import json
from datetime import datetime
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d6482c0f6b3a"
down_revision: Union[str, Sequence[str], None] = "f91d229aa401"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _audit_hash(payload: dict) -> str:
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def upgrade() -> None:
    op.add_column("audit_events", sa.Column("sequence_number", sa.Integer(), nullable=True))
    op.add_column("audit_events", sa.Column("previous_hash", sa.String(length=64), nullable=True))
    op.add_column("audit_events", sa.Column("event_hash", sa.String(length=64), nullable=True))

    connection = op.get_bind()
    rows = connection.execute(sa.text(
        "SELECT id, case_id, evidence_id, event_type, timestamp, actor, safe_metadata "
        "FROM audit_events ORDER BY case_id, timestamp, id"
    )).mappings()
    heads = {}
    for row in rows:
        case_id = row["case_id"]
        previous_hash, sequence_number = heads.get(case_id, ("0" * 64, 0))
        sequence_number += 1
        timestamp = row["timestamp"]
        if isinstance(timestamp, datetime):
            timestamp = timestamp.isoformat()
        elif timestamp:
            try:
                timestamp = datetime.fromisoformat(str(timestamp).replace("Z", "+00:00")).isoformat()
            except ValueError:
                timestamp = str(timestamp)
        else:
            timestamp = ""
        payload = {
            "id": row["id"],
            "case_id": case_id,
            "evidence_id": row["evidence_id"],
            "event_type": row["event_type"],
            "timestamp": timestamp,
            "actor": row["actor"],
            "safe_metadata": row["safe_metadata"],
            "sequence_number": sequence_number,
            "previous_hash": previous_hash,
        }
        event_hash = _audit_hash(payload)
        connection.execute(sa.text(
            "UPDATE audit_events SET sequence_number=:seq, previous_hash=:prev, event_hash=:digest WHERE id=:id"
        ), {"seq": sequence_number, "prev": previous_hash, "digest": event_hash, "id": row["id"]})
        heads[case_id] = (event_hash, sequence_number)

    with op.batch_alter_table("audit_events") as batch:
        batch.alter_column("sequence_number", existing_type=sa.Integer(), nullable=False)
        batch.alter_column("previous_hash", existing_type=sa.String(length=64), nullable=False)
        batch.alter_column("event_hash", existing_type=sa.String(length=64), nullable=False)
        batch.create_unique_constraint("uq_audit_case_sequence", ["case_id", "sequence_number"])
    op.create_index("ix_audit_events_event_hash", "audit_events", ["event_hash"])

    dialect = connection.dialect.name
    if dialect == "postgresql":
        op.execute("""
            CREATE FUNCTION reject_audit_event_mutation() RETURNS trigger AS $$
            BEGIN RAISE EXCEPTION 'audit_events is append-only'; END;
            $$ LANGUAGE plpgsql
        """)
        op.execute("""
            CREATE TRIGGER audit_events_append_only
            BEFORE UPDATE OR DELETE ON audit_events
            FOR EACH ROW EXECUTE FUNCTION reject_audit_event_mutation()
        """)
    elif dialect == "sqlite":
        op.execute("CREATE TRIGGER audit_events_no_update BEFORE UPDATE ON audit_events BEGIN SELECT RAISE(ABORT, 'audit_events is append-only'); END")
        op.execute("CREATE TRIGGER audit_events_no_delete BEFORE DELETE ON audit_events BEGIN SELECT RAISE(ABORT, 'audit_events is append-only'); END")

    op.add_column("analysis_jobs", sa.Column("request_hash", sa.String(length=64), nullable=True))
    op.add_column("analysis_jobs", sa.Column("parameters", sa.JSON(), nullable=True))
    for row in connection.execute(sa.text(
        "SELECT id, evidence_id, analysis_type, engine_version FROM analysis_jobs ORDER BY id"
    )).mappings():
        request = {
            "evidence_id": row["evidence_id"],
            "analysis_type": (row["analysis_type"] or "").upper().replace("-", "_"),
            "engine_version": row["engine_version"] or "legacy",
            "parameters": {},
            "legacy_job_id": row["id"],
        }
        request_hash = _audit_hash(request)
        connection.execute(sa.text(
            "UPDATE analysis_jobs SET request_hash=:request_hash, parameters='{}' WHERE id=:id"
        ), {"request_hash": request_hash, "id": row["id"]})
    with op.batch_alter_table("analysis_jobs") as batch:
        batch.alter_column("request_hash", existing_type=sa.String(length=64), nullable=False)
        batch.alter_column("parameters", existing_type=sa.JSON(), nullable=False)
        batch.create_unique_constraint("uq_analysis_jobs_request_hash", ["request_hash"])

    op.create_table(
        "analysis_job_outbox",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("job_id", sa.Integer(), sa.ForeignKey("analysis_jobs.id", ondelete="CASCADE"), nullable=False, unique=True, index=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("next_attempt_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("dispatched_at", sa.DateTime(), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    dialect = op.get_bind().dialect.name
    if dialect == "postgresql":
        op.execute("DROP TRIGGER IF EXISTS audit_events_append_only ON audit_events")
        op.execute("DROP FUNCTION IF EXISTS reject_audit_event_mutation()")
    elif dialect == "sqlite":
        op.execute("DROP TRIGGER IF EXISTS audit_events_no_update")
        op.execute("DROP TRIGGER IF EXISTS audit_events_no_delete")
    op.drop_table("analysis_job_outbox")
    with op.batch_alter_table("analysis_jobs") as batch:
        batch.drop_constraint("uq_analysis_jobs_request_hash", type_="unique")
        batch.drop_column("parameters")
        batch.drop_column("request_hash")
    op.drop_index("ix_audit_events_event_hash", table_name="audit_events")
    with op.batch_alter_table("audit_events") as batch:
        batch.drop_constraint("uq_audit_case_sequence", type_="unique")
        batch.drop_column("event_hash")
        batch.drop_column("previous_hash")
        batch.drop_column("sequence_number")

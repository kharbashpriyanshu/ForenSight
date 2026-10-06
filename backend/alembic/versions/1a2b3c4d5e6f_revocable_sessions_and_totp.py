"""Add rotating browser sessions and optional TOTP MFA."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "1a2b3c4d5e6f"
down_revision: Union[str, Sequence[str], None] = "d6482c0f6b3a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("totp_enabled", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("users", sa.Column("totp_secret_encrypted", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("totp_pending_secret_encrypted", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("totp_pending_expires_at", sa.DateTime(), nullable=True))
    op.add_column("users", sa.Column("totp_last_step", sa.Integer(), nullable=False, server_default="-1"))
    op.add_column("users", sa.Column("totp_recovery_hashes", sa.JSON(), nullable=False, server_default="[]"))
    op.add_column("users", sa.Column("auth_failed_attempts", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("users", sa.Column("auth_locked_until", sa.DateTime(), nullable=True))
    op.add_column("users", sa.Column("mfa_failed_attempts", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("users", sa.Column("mfa_locked_until", sa.DateTime(), nullable=True))
    op.create_table(
        "user_sessions",
        sa.Column("session_identifier", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("refresh_token_hash", sa.String(length=64), nullable=False, unique=True),
        sa.Column("previous_refresh_token_hash", sa.String(length=64), nullable=True),
        sa.Column("csrf_token_hash", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("last_used_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("user_agent", sa.String(length=300), nullable=True),
    )
    op.create_index("ix_user_sessions_user_id", "user_sessions", ["user_id"])
    op.create_index("ix_user_sessions_refresh_token_hash", "user_sessions", ["refresh_token_hash"])
    op.create_index("ix_user_sessions_previous_refresh_token_hash", "user_sessions", ["previous_refresh_token_hash"])
    op.create_index("ix_user_sessions_expires_at", "user_sessions", ["expires_at"])
    op.create_index("ix_user_sessions_revoked_at", "user_sessions", ["revoked_at"])


def downgrade() -> None:
    op.drop_index("ix_user_sessions_revoked_at", table_name="user_sessions")
    op.drop_index("ix_user_sessions_expires_at", table_name="user_sessions")
    op.drop_index("ix_user_sessions_previous_refresh_token_hash", table_name="user_sessions")
    op.drop_index("ix_user_sessions_refresh_token_hash", table_name="user_sessions")
    op.drop_index("ix_user_sessions_user_id", table_name="user_sessions")
    op.drop_table("user_sessions")
    op.drop_column("users", "totp_recovery_hashes")
    op.drop_column("users", "totp_last_step")
    op.drop_column("users", "totp_pending_secret_encrypted")
    op.drop_column("users", "totp_pending_expires_at")
    op.drop_column("users", "totp_secret_encrypted")
    op.drop_column("users", "totp_enabled")
    op.drop_column("users", "auth_locked_until")
    op.drop_column("users", "auth_failed_attempts")
    op.drop_column("users", "mfa_locked_until")
    op.drop_column("users", "mfa_failed_attempts")

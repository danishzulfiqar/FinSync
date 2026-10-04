"""gmail_credentials: DB-stored Gmail OAuth refresh token per user

Revision ID: 0005_gmail_credentials
Revises: 0004_user_preferences
Create Date: 2026-10-04
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0005_gmail_credentials"
down_revision: Union[str, None] = "0004_user_preferences"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "gmail_credentials",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("token_json", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("user_id", name="uq_gmail_credentials_user_id"),
    )
    op.create_index(
        "ix_gmail_credentials_user_id", "gmail_credentials", ["user_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_gmail_credentials_user_id", table_name="gmail_credentials")
    op.drop_table("gmail_credentials")

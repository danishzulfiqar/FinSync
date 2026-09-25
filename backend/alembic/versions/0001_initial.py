"""initial schema: transactions, transaction_sources, gmail_sync_state

Revision ID: 0001_initial
Revises:
Create Date: 2026-09-26
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "transactions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("account_identifier", sa.String(length=64), nullable=True),
        sa.Column("transaction_type", sa.String(length=16), nullable=False),
        sa.Column("amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="PKR"),
        sa.Column("transaction_datetime", sa.DateTime(timezone=True), nullable=True),
        sa.Column("merchant", sa.String(length=255), nullable=True),
        sa.Column("description", sa.String(length=1024), nullable=True),
        sa.Column("reference", sa.String(length=128), nullable=True),
        sa.Column("balance_after", sa.Numeric(18, 2), nullable=True),
        sa.Column("category", sa.String(length=64), nullable=True),
        sa.Column("source_type", sa.String(length=16), nullable=False),
        sa.Column("source_message_id", sa.String(length=255), nullable=True),
        sa.Column("source_message_hash", sa.String(length=64), nullable=True),
        sa.Column("raw_data", sa.JSON(), nullable=True),
        sa.Column("fingerprint", sa.String(length=64), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False, server_default="1.0"),
        sa.Column("verified", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("fingerprint", name="uq_transactions_fingerprint"),
    )
    op.create_index("ix_transactions_provider", "transactions", ["provider"])
    op.create_index("ix_transactions_account_identifier", "transactions", ["account_identifier"])
    op.create_index("ix_transactions_transaction_type", "transactions", ["transaction_type"])
    op.create_index("ix_transactions_transaction_datetime", "transactions", ["transaction_datetime"])
    op.create_index("ix_transactions_reference", "transactions", ["reference"])
    op.create_index("ix_transactions_category", "transactions", ["category"])
    op.create_index("ix_transactions_source_message_id", "transactions", ["source_message_id"])
    op.create_index("ix_transactions_source_message_hash", "transactions", ["source_message_hash"])
    op.create_index("ix_transactions_fingerprint", "transactions", ["fingerprint"])

    op.create_table(
        "transaction_sources",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("transaction_id", sa.Integer(), nullable=False),
        sa.Column("source_type", sa.String(length=16), nullable=False),
        sa.Column("source_id", sa.String(length=255), nullable=False),
        sa.Column("source_thread_id", sa.String(length=255), nullable=True),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("raw_hash", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["transaction_id"], ["transactions.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("source_type", "source_id", name="uq_source_type_source_id"),
        sa.UniqueConstraint("raw_hash", name="uq_source_raw_hash"),
    )
    op.create_index("ix_transaction_sources_transaction_id", "transaction_sources", ["transaction_id"])
    op.create_index("ix_transaction_sources_source_type", "transaction_sources", ["source_type"])
    op.create_index("ix_transaction_sources_source_id", "transaction_sources", ["source_id"])
    op.create_index("ix_transaction_sources_raw_hash", "transaction_sources", ["raw_hash"])

    op.create_table(
        "gmail_sync_state",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("last_history_id", sa.String(length=64), nullable=True),
        sa.Column("last_sync_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("provider", name="uq_gmail_sync_state_provider"),
    )
    op.create_index("ix_gmail_sync_state_provider", "gmail_sync_state", ["provider"])


def downgrade() -> None:
    op.drop_table("gmail_sync_state")
    op.drop_table("transaction_sources")
    op.drop_table("transactions")

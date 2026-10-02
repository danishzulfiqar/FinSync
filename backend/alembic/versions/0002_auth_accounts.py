"""auth + ownership: users, accounts, transactions.user_id/account_id

Revision ID: 0002_auth_accounts
Revises: 0001_initial
Create Date: 2026-09-29
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0002_auth_accounts"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("full_name", sa.String(length=120), nullable=False),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "accounts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("type", sa.String(length=16), nullable=False, server_default="current"),
        sa.Column("mask", sa.String(length=32), nullable=False),
        sa.Column("opening_balance", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="PKR"),
        sa.Column("color", sa.String(length=16), nullable=False, server_default="#7c3aed"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("user_id", "provider", "mask", name="uq_account_user_provider_mask"),
    )
    op.create_index("ix_accounts_user_id", "accounts", ["user_id"])
    op.create_index("ix_accounts_provider", "accounts", ["provider"])

    op.add_column("transactions", sa.Column("user_id", sa.Integer(), nullable=True))
    op.add_column("transactions", sa.Column("account_id", sa.Integer(), nullable=True))
    op.create_index("ix_transactions_user_id", "transactions", ["user_id"])
    op.create_index("ix_transactions_account_id", "transactions", ["account_id"])
    op.create_foreign_key(
        "fk_transactions_user_id",
        "transactions",
        "users",
        ["user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_transactions_account_id",
        "transactions",
        "accounts",
        ["account_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_transactions_account_id", "transactions", type_="foreignkey")
    op.drop_constraint("fk_transactions_user_id", "transactions", type_="foreignkey")
    op.drop_index("ix_transactions_account_id", table_name="transactions")
    op.drop_index("ix_transactions_user_id", table_name="transactions")
    op.drop_column("transactions", "account_id")
    op.drop_column("transactions", "user_id")

    op.drop_index("ix_accounts_provider", table_name="accounts")
    op.drop_index("ix_accounts_user_id", table_name="accounts")
    op.drop_table("accounts")

    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")

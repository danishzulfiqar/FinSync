"""accounts.is_active: on/off toggle (off accounts drop out of totals)

Revision ID: 0006_account_active
Revises: 0005_gmail_credentials
Create Date: 2026-10-07
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0006_account_active"
down_revision: Union[str, None] = "0005_gmail_credentials"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "accounts",
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )


def downgrade() -> None:
    op.drop_column("accounts", "is_active")

"""statement backfill: pin dates to UTC calendar days, create + link accounts

Revision ID: 0003_statement_backfill
Revises: 0002_auth_accounts
Create Date: 2026-10-02

Data-only migration. Safe/no-op on an empty database.

1. Statement rows carry no time-of-day. Earlier imports stored naive midnights
   that Postgres interpreted in the server timezone; re-pin them to UTC
   midnight of the same calendar day so the date survives any viewer TZ.
2. Every unlinked statement row gets an account for (user, provider, last-4),
   with opening balance derived exactly from the first row:
   opening = balance_after - signed(amount).
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0003_statement_backfill"
down_revision: Union[str, None] = "0002_auth_accounts"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_DIGITS = r"regexp_replace(coalesce(account_identifier, ''), '\D', '', 'g')"


def upgrade() -> None:
    # 1. Re-pin non-UTC-midnight statement datetimes to UTC midnight of their local day.
    op.execute(
        """
        UPDATE transactions
        SET transaction_datetime =
            ((transaction_datetime AT TIME ZONE current_setting('TimeZone'))::date::timestamp
             AT TIME ZONE 'UTC')
        WHERE source_type = 'statement'
          AND transaction_datetime IS NOT NULL
          AND (transaction_datetime AT TIME ZONE 'UTC')::time <> TIME '00:00:00'
        """
    )

    # 2a. Create one account per (user, provider, last-4) seen in unlinked statement rows.
    op.execute(
        f"""
        WITH src AS (
            SELECT id, user_id, lower(provider) AS provider, currency,
                   transaction_datetime, transaction_type, amount, balance_after,
                   right({_DIGITS}, 4) AS last4,
                   length({_DIGITS}) AS ndigits
            FROM transactions
            WHERE source_type = 'statement' AND account_id IS NULL AND user_id IS NOT NULL
        ),
        first_row AS (
            SELECT DISTINCT ON (user_id, provider, last4)
                   user_id, provider, last4, currency,
                   balance_after - CASE WHEN transaction_type = 'credit' THEN amount ELSE -amount END
                       AS opening
            FROM src
            WHERE ndigits >= 4
            ORDER BY user_id, provider, last4, transaction_datetime ASC NULLS LAST, id ASC
        )
        INSERT INTO accounts (user_id, name, provider, type, mask, opening_balance, currency, color)
        SELECT user_id,
               CASE provider WHEN 'abl' THEN 'Allied Bank'
                             WHEN 'hbl' THEN 'HBL'
                             WHEN 'nayapay' THEN 'NayaPay'
                             ELSE initcap(provider) END || ' ' || last4,
               provider,
               'current',
               '•••• ' || last4,
               coalesce(opening, 0),
               coalesce(nullif(currency, ''), 'PKR'),
               CASE provider WHEN 'abl' THEN '#0ea5e9'
                             WHEN 'hbl' THEN '#16a34a'
                             WHEN 'nayapay' THEN '#7c3aed'
                             ELSE '#7c3aed' END
        FROM first_row
        ON CONFLICT (user_id, provider, mask) DO NOTHING
        """
    )

    # 2b. Link the rows to their account.
    op.execute(
        f"""
        UPDATE transactions t
        SET account_id = a.id
        FROM accounts a
        WHERE t.account_id IS NULL
          AND t.source_type = 'statement'
          AND t.user_id = a.user_id
          AND lower(t.provider) = a.provider
          AND length({_DIGITS.replace('account_identifier', 't.account_identifier')}) >= 4
          AND a.mask = '•••• ' || right({_DIGITS.replace('account_identifier', 't.account_identifier')}, 4)
        """
    )


def downgrade() -> None:
    # Data-only backfill; linked rows and derived accounts are left in place.
    pass

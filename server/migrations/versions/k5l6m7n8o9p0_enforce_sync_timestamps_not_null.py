"""Enforce non-null sync timestamps on every synced table.

Revision ID: k5l6m7n8o9p0
Revises: j4k5l6m7n8o9
Create Date: 2026-10-23 17:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "k5l6m7n8o9p0"
down_revision: Union[str, Sequence[str], None] = "j4k5l6m7n8o9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Tables whose last_modified_at is still nullable, plus the best available
# fallback for legacy rows that predate the column default.
TABLE_FALLBACKS = (
    ("attendance_group_rules", "created_at"),
    ("attendance_members", "joined_at"),
    ("attendance_records", "timestamp"),
    ("attendance_sessions", "check_in_time"),
    ("faces", "created_at"),
)

UTC_TRIGGER_TABLES = ("attendance_records", "attendance_sessions")


def _recreate_utc_triggers(table: str) -> None:
    for operation in ("INSERT", "UPDATE"):
        guard = (
            "NEW.modified_at_utc IS NULL"
            if operation == "INSERT"
            else "NEW.modified_at_utc IS OLD.modified_at_utc"
        )
        op.execute(f"""
            CREATE TRIGGER {table}_utc_{operation.lower()}
            AFTER {operation} ON {table}
            WHEN {guard}
            BEGIN
                UPDATE {table}
                SET modified_at_utc = strftime('%Y-%m-%d %H:%M:%f', 'now')
                WHERE rowid = NEW.rowid
                  AND modified_at_utc IS NOT strftime('%Y-%m-%d %H:%M:%f', 'now');
            END
        """)


def _drop_utc_triggers(table: str) -> None:
    for operation in ("insert", "update"):
        op.execute(f"DROP TRIGGER IF EXISTS {table}_utc_{operation}")


def _set_nullable(nullable: bool) -> None:
    for table, fallback in TABLE_FALLBACKS:
        if nullable:
            _drop_utc_triggers(table)
        else:
            op.execute(
                sa.text(f"""
                    UPDATE {table}
                    SET last_modified_at = COALESCE(
                        last_modified_at, {fallback}, CURRENT_TIMESTAMP
                    )
                    WHERE last_modified_at IS NULL
                    """)
            )

        with op.batch_alter_table(table, recreate="always") as batch_op:
            batch_op.alter_column(
                "last_modified_at",
                existing_type=sa.DateTime(),
                nullable=nullable,
                server_default=sa.text("CURRENT_TIMESTAMP"),
            )

        if table in UTC_TRIGGER_TABLES:
            _recreate_utc_triggers(table)


def upgrade() -> None:
    _set_nullable(nullable=False)


def downgrade() -> None:
    _set_nullable(nullable=True)

"""Preserve exact instants for new attendance; leave historical rows untouched."""

from alembic import op
import sqlalchemy as sa

revision = "j4k5l6m7n8o9"
down_revision = "i3j4k5l6m7n8"
branch_labels = None
depends_on = None

TABLE_FIELDS = {
    "attendance_records": ("timestamp",),
    "attendance_sessions": ("check_in_time", "check_out_time"),
}


def upgrade():
    op.add_column(
        "attendance_settings",
        sa.Column("attendance_timezone", sa.String(), nullable=True),
    )
    for table, fields in TABLE_FIELDS.items():
        op.add_column(table, sa.Column("modified_at_utc", sa.DateTime(), nullable=True))
        for field in fields:
            op.add_column(
                table, sa.Column(f"{field}_utc", sa.DateTime(), nullable=True)
            )
            op.add_column(
                table, sa.Column(f"{field}_timezone", sa.String(), nullable=True)
            )
            op.add_column(
                table, sa.Column(f"{field}_offset_seconds", sa.Integer(), nullable=True)
            )
        # Also covers raw SQL and old writers. Legacy rows remain NULL until
        # actually modified. The guard prevents recursive-trigger loops.
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
    op.create_index(
        "ix_attendance_records_timestamp_utc", "attendance_records", ["timestamp_utc"]
    )


def downgrade():
    # A destructive downgrade would discard the only disambiguation of DST folds.
    raise RuntimeError(
        "Restore a pre-upgrade backup instead of discarding attendance instants."
    )

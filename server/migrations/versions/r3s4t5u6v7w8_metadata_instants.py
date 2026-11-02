"""Capture enrollment/rule instants without guessing historical timezones."""

from alembic import op
import sqlalchemy as sa

revision = "r3s4t5u6v7w8"
down_revision = "q2r3s4t5u6v7"
branch_labels = None
depends_on = None


def upgrade():
    for table, field in (
        ("attendance_members", "joined_at"),
        ("attendance_group_rules", "effective_from"),
    ):
        op.add_column(table, sa.Column(f"{field}_utc", sa.DateTime(), nullable=True))
        op.add_column(table, sa.Column(f"{field}_timezone", sa.String(), nullable=True))
        op.add_column(
            table, sa.Column(f"{field}_offset_seconds", sa.Integer(), nullable=True)
        )
    op.add_column(
        "attendance_settings",
        sa.Column("session_policy_updated_at_utc", sa.DateTime(), nullable=True),
    )
    # A new metadata watermark requests a bounded replay of saved session rules.
    # No existing captured times or sync timestamps are rewritten.
    op.execute(
        "UPDATE attendance_settings SET session_policy_updated_at_utc = CURRENT_TIMESTAMP"
    )


def downgrade():
    raise RuntimeError(
        "Captured enrollment and schedule instants must not be discarded."
    )

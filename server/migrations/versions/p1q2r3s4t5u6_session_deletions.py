"""Retain retired attendance session IDs until Cloud has observed their deletion."""

from alembic import op
import sqlalchemy as sa

revision = "p1q2r3s4t5u6"
down_revision = "o0p1q2r3s4t5"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "attendance_session_deletions",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("organization_id", sa.String(), nullable=True),
        sa.Column("person_id", sa.String(), nullable=False),
        sa.Column("group_id", sa.String(), nullable=False),
        sa.Column("date", sa.String(), nullable=False),
        sa.Column(
            "deleted_at_utc",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )
    op.create_index(
        "ix_attendance_session_deletions_organization_id",
        "attendance_session_deletions",
        ["organization_id"],
    )
    op.create_index(
        "ix_attendance_session_deletions_deleted_at_utc",
        "attendance_session_deletions",
        ["deleted_at_utc"],
    )


def downgrade():
    raise RuntimeError("Session deletion history must not be discarded by a downgrade.")

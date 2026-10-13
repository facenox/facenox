"""Track local edits and acknowledged Cloud revisions."""

from alembic import op
import sqlalchemy as sa

revision = "h2i3j4k5l6m7"
down_revision = "g1h2i3j4k5l6"
branch_labels = None
depends_on = None


def upgrade():
    for table in ("attendance_groups", "attendance_members", "faces"):
        op.add_column(
            table,
            sa.Column(
                "sync_revision", sa.Integer(), nullable=False, server_default="0"
            ),
        )
        op.add_column(
            table,
            sa.Column("sync_dirty", sa.Boolean(), nullable=False, server_default="1"),
        )


def downgrade():
    for table in ("faces", "attendance_members", "attendance_groups"):
        op.drop_column(table, "sync_dirty")
        op.drop_column(table, "sync_revision")

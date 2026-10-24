"""Add explicit attendance workflows to groups and group rules."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "l7m8n9o0p1q2"
down_revision: Union[str, Sequence[str], None] = "k5l6m7n8o9p0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("attendance_groups", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "attendance_mode",
                sa.String(),
                nullable=False,
                server_default="attendance",
            )
        )
    with op.batch_alter_table("attendance_group_rules", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "attendance_mode",
                sa.String(),
                nullable=False,
                server_default="attendance",
            )
        )

    op.execute(
        "UPDATE attendance_groups SET attendance_mode = 'work_hours' WHERE track_checkout = 1"
    )
    op.execute(
        "UPDATE attendance_group_rules SET attendance_mode = 'work_hours' WHERE track_checkout = 1"
    )


def downgrade() -> None:
    with op.batch_alter_table("attendance_group_rules", schema=None) as batch_op:
        batch_op.drop_column("attendance_mode")
    with op.batch_alter_table("attendance_groups", schema=None) as batch_op:
        batch_op.drop_column("attendance_mode")

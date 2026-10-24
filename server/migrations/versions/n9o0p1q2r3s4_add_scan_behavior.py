"""Add deployment-aware scan behavior to groups and rules."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "n9o0p1q2r3s4"
down_revision: Union[str, Sequence[str], None] = "m8n9o0p1q2r3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("attendance_groups", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "scan_behavior",
                sa.String(),
                nullable=False,
                server_default="automatic",
            )
        )

    with op.batch_alter_table("attendance_group_rules", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "scan_behavior",
                sa.String(),
                nullable=False,
                server_default="automatic",
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("attendance_group_rules", schema=None) as batch_op:
        batch_op.drop_column("scan_behavior")

    with op.batch_alter_table("attendance_groups", schema=None) as batch_op:
        batch_op.drop_column("scan_behavior")

"""add_class_end_time

Revision ID: g1h2i3j4k5l6
Revises: f2b3c4d5e6f7
Create Date: 2026-10-09 10:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "g1h2i3j4k5l6"
down_revision: Union[str, Sequence[str], None] = "f2b3c4d5e6f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema to add class_end_time column to groups and group rules."""
    with op.batch_alter_table("attendance_groups", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "class_end_time",
                sa.String(),
                nullable=True,
            )
        )

    with op.batch_alter_table("attendance_group_rules", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "class_end_time",
                sa.String(),
                nullable=True,
            )
        )


def downgrade() -> None:
    """Downgrade schema to remove class_end_time column."""
    with op.batch_alter_table("attendance_group_rules", schema=None) as batch_op:
        batch_op.drop_column("class_end_time")

    with op.batch_alter_table("attendance_groups", schema=None) as batch_op:
        batch_op.drop_column("class_end_time")

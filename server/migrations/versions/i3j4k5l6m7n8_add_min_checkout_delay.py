"""add_min_checkout_delay

Revision ID: i3j4k5l6m7n8
Revises: h2i3j4k5l6m7
Create Date: 2026-10-15 21:40:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "i3j4k5l6m7n8"
down_revision: Union[str, Sequence[str], None] = "h2i3j4k5l6m7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema to add min_checkout_delay_minutes column to groups and group rules."""
    with op.batch_alter_table("attendance_groups", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "min_checkout_delay_minutes",
                sa.Integer(),
                nullable=True,
                server_default="15",
            )
        )

    with op.batch_alter_table("attendance_group_rules", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "min_checkout_delay_minutes",
                sa.Integer(),
                nullable=True,
                server_default="15",
            )
        )


def downgrade() -> None:
    """Downgrade schema to remove min_checkout_delay_minutes column."""
    with op.batch_alter_table("attendance_group_rules", schema=None) as batch_op:
        batch_op.drop_column("min_checkout_delay_minutes")

    with op.batch_alter_table("attendance_groups", schema=None) as batch_op:
        batch_op.drop_column("min_checkout_delay_minutes")

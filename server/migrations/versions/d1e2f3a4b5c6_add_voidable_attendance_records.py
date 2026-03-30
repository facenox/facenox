"""Add voidable attendance records

Revision ID: d1e2f3a4b5c6
Revises: c9d8e7f6a5b4
Create Date: 2026-03-30 22:55:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "d1e2f3a4b5c6"
down_revision: Union[str, Sequence[str], None] = "c9d8e7f6a5b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table("attendance_records", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "is_voided",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("0"),
            )
        )
        batch_op.add_column(sa.Column("voided_at", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("voided_by", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("void_reason", sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table("attendance_records", schema=None) as batch_op:
        batch_op.drop_column("void_reason")
        batch_op.drop_column("voided_by")
        batch_op.drop_column("voided_at")
        batch_op.drop_column("is_voided")

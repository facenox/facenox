"""Store device and direction metadata for attendance events."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "o0p1q2r3s4t5"
down_revision: Union[str, Sequence[str], None] = "n9o0p1q2r3s4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("attendance_records", schema=None) as batch_op:
        batch_op.add_column(sa.Column("device_id", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("event_type", sa.String(), nullable=True))
        batch_op.create_index("ix_record_device_id", ["device_id"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("attendance_records", schema=None) as batch_op:
        batch_op.drop_index("ix_record_device_id")
        batch_op.drop_column("event_type")
        batch_op.drop_column("device_id")

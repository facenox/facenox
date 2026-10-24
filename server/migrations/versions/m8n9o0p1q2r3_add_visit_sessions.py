"""Allow multiple attendance visits for one member on one date."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "m8n9o0p1q2r3"
down_revision: Union[str, Sequence[str], None] = "l7m8n9o0p1q2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("attendance_sessions", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("visit_number", sa.Integer(), nullable=False, server_default="1")
        )
        batch_op.drop_index("ux_session_member_date")
        batch_op.create_index(
            "ux_session_member_date_visit",
            ["member_id", "date", "visit_number"],
            unique=True,
        )


def downgrade() -> None:
    with op.batch_alter_table("attendance_sessions", schema=None) as batch_op:
        batch_op.drop_index("ux_session_member_date_visit")
        batch_op.create_index(
            "ux_session_member_date", ["member_id", "date"], unique=True
        )
        batch_op.drop_column("visit_number")

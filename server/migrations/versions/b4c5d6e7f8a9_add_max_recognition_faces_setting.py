"""Add max recognition faces per frame setting

Revision ID: b4c5d6e7f8a9
Revises: c7f8b7b9a123
Create Date: 2026-03-26 22:15:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "b4c5d6e7f8a9"
down_revision: Union[str, Sequence[str], None] = "c7f8b7b9a123"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table("attendance_settings", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "max_recognition_faces_per_frame",
                sa.Integer(),
                nullable=False,
                server_default=sa.text("6"),
            )
        )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table("attendance_settings", schema=None) as batch_op:
        batch_op.drop_column("max_recognition_faces_per_frame")

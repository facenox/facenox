"""Persist Cloud liveness enforcement separately from the local preference."""

from alembic import op
import sqlalchemy as sa

revision = "s4t5u6v7w8x9"
down_revision = "r3s4t5u6v7w8"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "attendance_settings",
        sa.Column(
            "cloud_force_liveness",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )


def downgrade():
    raise RuntimeError("Cloud liveness enforcement must not be silently discarded.")

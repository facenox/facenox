"""Enforce unique attendance settings row per organization

Revision ID: c7f8b7b9a123
Revises: fdabcb4e0dab
Create Date: 2026-03-25 01:40:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "c7f8b7b9a123"
down_revision: Union[str, Sequence[str], None] = "fdabcb4e0dab"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    conn = op.get_bind()

    # Keep the newest row for each org before we enforce uniqueness.
    conn.execute(sa.text("""
            DELETE FROM attendance_settings
            WHERE organization_id IS NOT NULL
              AND id NOT IN (
                SELECT MAX(id)
                FROM attendance_settings
                WHERE organization_id IS NOT NULL
                GROUP BY organization_id
              )
            """))

    with op.batch_alter_table("attendance_settings", schema=None) as batch_op:
        batch_op.drop_index("ix_attendance_settings_organization_id")

    op.create_index(
        "ux_attendance_settings_organization_id",
        "attendance_settings",
        ["organization_id"],
        unique=True,
        sqlite_where=sa.text("organization_id IS NOT NULL"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(
        "ux_attendance_settings_organization_id", table_name="attendance_settings"
    )

    with op.batch_alter_table("attendance_settings", schema=None) as batch_op:
        batch_op.create_index(
            "ix_attendance_settings_organization_id", ["organization_id"], unique=False
        )

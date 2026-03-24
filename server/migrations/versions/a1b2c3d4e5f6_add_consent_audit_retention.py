"""Add consent audit fields, data_retention_days, and audit_logs table

Revision ID: a1b2c3d4e5f6
Revises: 61aff97fdd77
Create Date: 2026-03-07 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "61aff97fdd77"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add compliance columns and audit log table."""

    # attendance_members: consent audit fields
    with op.batch_alter_table("attendance_members", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("consent_granted_at", sa.DateTime(), nullable=True)
        )
        batch_op.add_column(sa.Column("consent_granted_by", sa.String(), nullable=True))

    # attendance_settings: data retention policy
    with op.batch_alter_table("attendance_settings", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "data_retention_days",
                sa.Integer(),
                nullable=False,
                server_default=sa.text("0"),
            )
        )

    # audit_logs: immutable action trail
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column(
            "timestamp",
            sa.DateTime(),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column("target_type", sa.String(), nullable=True),
        sa.Column("target_id", sa.String(), nullable=True),
        sa.Column("details", sa.Text(), nullable=True),
        sa.Column("organization_id", sa.String(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audit_timestamp", "audit_logs", ["timestamp"])
    op.create_index("ix_audit_action", "audit_logs", ["action"])
    op.create_index("ix_audit_target_id", "audit_logs", ["target_id"])
    op.create_index("ix_audit_org_id", "audit_logs", ["organization_id"])


def downgrade() -> None:
    """Reverse compliance additions."""
    op.drop_index("ix_audit_org_id", table_name="audit_logs")
    op.drop_index("ix_audit_target_id", table_name="audit_logs")
    op.drop_index("ix_audit_action", table_name="audit_logs")
    op.drop_index("ix_audit_timestamp", table_name="audit_logs")
    op.drop_table("audit_logs")

    with op.batch_alter_table("attendance_settings", schema=None) as batch_op:
        batch_op.drop_column("data_retention_days")

    with op.batch_alter_table("attendance_members", schema=None) as batch_op:
        batch_op.drop_column("consent_granted_by")
        batch_op.drop_column("consent_granted_at")

"""Drop consent columns from members and groups

Removes has_consent, consent_granted_at, consent_granted_by from
attendance_members and biometric_consent_certified from attendance_groups.
Consent is no longer tracked per-member; enrollment implies consent.

Revision ID: f2b3c4d5e6f7
Revises: e3b4c5d6e7f8
Create Date: 2026-10-08 11:30:00.000000

"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f2b3c4d5e6f7"
down_revision: Union[str, Sequence[str], None] = "e3b4c5d6e7f8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Drop consent-related columns that are no longer part of the data model."""
    # Drop per-member consent tracking columns
    with op.batch_alter_table("attendance_members", schema=None) as batch_op:
        batch_op.drop_column("has_consent")
        batch_op.drop_column("consent_granted_at")
        batch_op.drop_column("consent_granted_by")

    # Drop group-level consent certification flag
    with op.batch_alter_table("attendance_groups", schema=None) as batch_op:
        batch_op.drop_column("biometric_consent_certified")


def downgrade() -> None:
    """Re-add consent columns (for rollback only; values will be lost)."""
    import sqlalchemy as sa

    with op.batch_alter_table("attendance_groups", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "biometric_consent_certified",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("0"),
            )
        )

    with op.batch_alter_table("attendance_members", schema=None) as batch_op:
        batch_op.add_column(sa.Column("consent_granted_by", sa.String(), nullable=True))
        batch_op.add_column(
            sa.Column("consent_granted_at", sa.DateTime(), nullable=True)
        )
        batch_op.add_column(
            sa.Column(
                "has_consent",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("0"),
            )
        )

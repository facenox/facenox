"""add_effective_dated_group_rules

Revision ID: f1a2b3c4d5e6
Revises: e8b1f2c4d5a6
Create Date: 2026-03-29 12:10:00.000000

"""

from datetime import datetime
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import ulid

# revision identifiers, used by Alembic.
revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "e8b1f2c4d5a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "attendance_group_rules",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("group_id", sa.String(), nullable=False),
        sa.Column("effective_from", sa.DateTime(), nullable=False),
        sa.Column("late_threshold_minutes", sa.Integer(), nullable=True),
        sa.Column(
            "late_threshold_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("class_start_time", sa.String(), nullable=False),
        sa.Column(
            "track_checkout", sa.Boolean(), nullable=False, server_default=sa.text("0")
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column("organization_id", sa.String(), nullable=True),
        sa.Column("cloud_id", sa.String(), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column(
            "last_modified_at",
            sa.DateTime(),
            nullable=True,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("0")
        ),
        sa.ForeignKeyConstraint(["group_id"], ["attendance_groups.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_group_rule_group_id", "attendance_group_rules", ["group_id"], unique=False
    )
    op.create_index(
        "ix_group_rule_group_effective_from",
        "attendance_group_rules",
        ["group_id", "effective_from"],
        unique=False,
    )
    op.create_index(
        "ix_attendance_group_rules_organization_id",
        "attendance_group_rules",
        ["organization_id"],
        unique=False,
    )
    op.create_index(
        "ix_attendance_group_rules_cloud_id",
        "attendance_group_rules",
        ["cloud_id"],
        unique=False,
    )

    with op.batch_alter_table("attendance_sessions", schema=None) as batch_op:
        batch_op.add_column(sa.Column("applied_rule_id", sa.String(), nullable=True))
        batch_op.create_foreign_key(
            "fk_attendance_sessions_applied_rule_id",
            "attendance_group_rules",
            ["applied_rule_id"],
            ["id"],
        )
        batch_op.create_index(
            "ix_session_applied_rule_id", ["applied_rule_id"], unique=False
        )

    bind = op.get_bind()
    groups = bind.execute(sa.text("""
            SELECT
                id,
                created_at,
                late_threshold_minutes,
                late_threshold_enabled,
                class_start_time,
                track_checkout,
                organization_id,
                cloud_id,
                version,
                last_modified_at
            FROM attendance_groups
            """)).mappings()

    for group in groups:
        rule_id = ulid.ulid()
        effective_from = group["created_at"] or datetime.now()
        class_start_time = group["class_start_time"] or "08:00"
        last_modified_at = group["last_modified_at"] or effective_from

        bind.execute(
            sa.text("""
                INSERT INTO attendance_group_rules (
                    id,
                    group_id,
                    effective_from,
                    late_threshold_minutes,
                    late_threshold_enabled,
                    class_start_time,
                    track_checkout,
                    created_at,
                    organization_id,
                    cloud_id,
                    version,
                    last_modified_at,
                    is_deleted
                ) VALUES (
                    :id,
                    :group_id,
                    :effective_from,
                    :late_threshold_minutes,
                    :late_threshold_enabled,
                    :class_start_time,
                    :track_checkout,
                    :created_at,
                    :organization_id,
                    :cloud_id,
                    :version,
                    :last_modified_at,
                    0
                )
                """),
            {
                "id": rule_id,
                "group_id": group["id"],
                "effective_from": effective_from,
                "late_threshold_minutes": group["late_threshold_minutes"],
                "late_threshold_enabled": group["late_threshold_enabled"] or False,
                "class_start_time": class_start_time,
                "track_checkout": group["track_checkout"] or False,
                "created_at": effective_from,
                "organization_id": group["organization_id"],
                "cloud_id": group["cloud_id"],
                "version": group["version"] or 1,
                "last_modified_at": last_modified_at,
            },
        )
        bind.execute(
            sa.text("""
                UPDATE attendance_sessions
                SET applied_rule_id = :rule_id
                WHERE group_id = :group_id
                  AND applied_rule_id IS NULL
                """),
            {"rule_id": rule_id, "group_id": group["id"]},
        )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table("attendance_sessions", schema=None) as batch_op:
        batch_op.drop_index("ix_session_applied_rule_id")
        batch_op.drop_constraint(
            "fk_attendance_sessions_applied_rule_id", type_="foreignkey"
        )
        batch_op.drop_column("applied_rule_id")

    op.drop_index(
        "ix_attendance_group_rules_cloud_id", table_name="attendance_group_rules"
    )
    op.drop_index(
        "ix_attendance_group_rules_organization_id",
        table_name="attendance_group_rules",
    )
    op.drop_index(
        "ix_group_rule_group_effective_from", table_name="attendance_group_rules"
    )
    op.drop_index("ix_group_rule_group_id", table_name="attendance_group_rules")
    op.drop_table("attendance_group_rules")

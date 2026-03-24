"""Support org-scoped person IDs

Revision ID: e8b1f2c4d5a6
Revises: c7f8b7b9a123
Create Date: 2026-03-25 02:10:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "e8b1f2c4d5a6"
down_revision: Union[str, Sequence[str], None] = "c7f8b7b9a123"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _drop_retry_table(table_name: str) -> None:
    op.execute(sa.text(f"DROP TABLE IF EXISTS {table_name}"))


def _drop_retry_index(index_name: str) -> None:
    op.execute(sa.text(f"DROP INDEX IF EXISTS {index_name}"))


def _member_key_expr(alias: str) -> str:
    return (
        f"CASE "
        f"WHEN {alias}.organization_id IS NULL THEN 'member:global:' || {alias}.person_id "
        f"ELSE 'member:' || {alias}.organization_id || ':' || {alias}.person_id "
        f"END"
    )


def _face_key_expr(alias: str) -> str:
    return (
        f"CASE "
        f"WHEN {alias}.organization_id IS NULL THEN 'face:global:' || {alias}.person_id "
        f"ELSE 'face:' || {alias}.organization_id || ':' || {alias}.person_id "
        f"END"
    )


def upgrade() -> None:
    """Upgrade schema."""
    # SQLite leaves behind temp tables after a failed non-transactional DDL run.
    # Clean those up so a rerun can proceed from the real source tables.
    for table_name in (
        "attendance_members_v2",
        "attendance_records_v2",
        "attendance_sessions_v2",
        "faces_v2",
    ):
        _drop_retry_table(table_name)

    # Release legacy index names before we rebuild the tables and recreate them.
    for index_name in (
        "ix_member_group_id",
        "ix_member_person_org",
        "ix_attendance_members_organization_id",
        "ix_attendance_members_cloud_id",
        "ix_record_group_id",
        "ix_record_person_id",
        "ix_record_timestamp",
        "ix_record_group_timestamp",
        "ix_attendance_records_organization_id",
        "ix_attendance_records_cloud_id",
        "ix_session_group_id",
        "ix_session_person_id",
        "ix_session_date",
        "ix_session_group_date",
        "ix_session_person_date_org",
        "ix_attendance_sessions_organization_id",
        "ix_attendance_sessions_cloud_id",
        "ix_face_person_id",
        "ix_faces_hash",
        "ix_faces_organization_id",
        "ix_faces_cloud_id",
    ):
        _drop_retry_index(index_name)

    op.create_table(
        "attendance_members_v2",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("person_id", sa.String(), nullable=False),
        sa.Column("group_id", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=True),
        sa.Column("email", sa.String(), nullable=True),
        sa.Column(
            "joined_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")
        ),
        sa.Column(
            "has_consent", sa.Boolean(), nullable=False, server_default=sa.text("0")
        ),
        sa.Column("consent_granted_at", sa.DateTime(), nullable=True),
        sa.Column("consent_granted_by", sa.String(), nullable=True),
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

    op.execute(sa.text(f"""
            INSERT INTO attendance_members_v2 (
                id, person_id, group_id, name, role, email, joined_at, is_active,
                has_consent, consent_granted_at, consent_granted_by, organization_id,
                cloud_id, version, last_modified_at, is_deleted
            )
            SELECT
                {_member_key_expr("m")} AS id,
                m.person_id,
                m.group_id,
                m.name,
                m.role,
                m.email,
                m.joined_at,
                m.is_active,
                m.has_consent,
                m.consent_granted_at,
                m.consent_granted_by,
                m.organization_id,
                m.cloud_id,
                m.version,
                m.last_modified_at,
                m.is_deleted
            FROM attendance_members AS m
            """))

    op.rename_table("attendance_members", "attendance_members_old")
    op.rename_table("attendance_members_v2", "attendance_members")

    op.create_index(
        "ix_member_group_id", "attendance_members", ["group_id"], unique=False
    )
    op.create_index(
        "ux_member_person_global",
        "attendance_members",
        ["person_id"],
        unique=True,
        sqlite_where=sa.text("organization_id IS NULL"),
    )
    op.create_index(
        "ux_member_person_org",
        "attendance_members",
        ["person_id", "organization_id"],
        unique=True,
        sqlite_where=sa.text("organization_id IS NOT NULL"),
    )
    op.create_index(
        "ix_attendance_members_organization_id",
        "attendance_members",
        ["organization_id"],
        unique=False,
    )
    op.create_index(
        "ix_attendance_members_cloud_id",
        "attendance_members",
        ["cloud_id"],
        unique=False,
    )

    op.create_table(
        "attendance_records_v2",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("person_id", sa.String(), nullable=False),
        sa.Column("member_id", sa.String(), nullable=False),
        sa.Column("group_id", sa.String(), nullable=False),
        sa.Column("timestamp", sa.DateTime(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("location", sa.String(), nullable=True),
        sa.Column("notes", sa.String(), nullable=True),
        sa.Column(
            "is_manual", sa.Boolean(), nullable=False, server_default=sa.text("0")
        ),
        sa.Column("created_by", sa.String(), nullable=True),
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
        sa.ForeignKeyConstraint(["member_id"], ["attendance_members.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.execute(sa.text(f"""
            INSERT INTO attendance_records_v2 (
                id, person_id, member_id, group_id, timestamp, confidence, location,
                notes, is_manual, created_by, organization_id, cloud_id, version,
                last_modified_at, is_deleted
            )
            SELECT
                r.id,
                r.person_id,
                {_member_key_expr("m")} AS member_id,
                r.group_id,
                r.timestamp,
                r.confidence,
                r.location,
                r.notes,
                r.is_manual,
                r.created_by,
                r.organization_id,
                r.cloud_id,
                r.version,
                r.last_modified_at,
                r.is_deleted
            FROM attendance_records AS r
            JOIN attendance_members_old AS m
              ON m.person_id = r.person_id
             AND (
                  (m.organization_id = r.organization_id)
                  OR (m.organization_id IS NULL AND r.organization_id IS NULL)
             )
            """))
    op.drop_table("attendance_records")
    op.rename_table("attendance_records_v2", "attendance_records")
    op.create_index(
        "ix_record_group_id", "attendance_records", ["group_id"], unique=False
    )
    op.create_index(
        "ix_record_person_id", "attendance_records", ["person_id"], unique=False
    )
    op.create_index(
        "ix_record_member_id", "attendance_records", ["member_id"], unique=False
    )
    op.create_index(
        "ix_record_timestamp", "attendance_records", ["timestamp"], unique=False
    )
    op.create_index(
        "ix_record_group_timestamp",
        "attendance_records",
        ["group_id", "timestamp"],
        unique=False,
    )
    op.create_index(
        "ix_attendance_records_organization_id",
        "attendance_records",
        ["organization_id"],
        unique=False,
    )
    op.create_index(
        "ix_attendance_records_cloud_id",
        "attendance_records",
        ["cloud_id"],
        unique=False,
    )

    op.create_table(
        "attendance_sessions_v2",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("person_id", sa.String(), nullable=False),
        sa.Column("member_id", sa.String(), nullable=False),
        sa.Column("group_id", sa.String(), nullable=False),
        sa.Column("date", sa.String(), nullable=False),
        sa.Column("check_in_time", sa.DateTime(), nullable=True),
        sa.Column("check_out_time", sa.DateTime(), nullable=True),
        sa.Column("total_hours", sa.Float(), nullable=True),
        sa.Column(
            "status", sa.String(), nullable=False, server_default=sa.text("'absent'")
        ),
        sa.Column("is_late", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("late_minutes", sa.Integer(), nullable=True),
        sa.Column("notes", sa.String(), nullable=True),
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
        sa.ForeignKeyConstraint(["member_id"], ["attendance_members.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.execute(sa.text(f"""
            WITH ranked_sessions AS (
                SELECT
                    s.*,
                    ROW_NUMBER() OVER (
                        PARTITION BY s.organization_id, s.person_id, s.date
                        ORDER BY
                            COALESCE(s.last_modified_at, s.check_out_time, s.check_in_time) DESC,
                            s.id DESC
                    ) AS rn
                FROM attendance_sessions AS s
            ),
            session_rollups AS (
                SELECT
                    s.organization_id,
                    s.person_id,
                    s.date,
                    MIN(s.check_in_time) AS check_in_time,
                    MAX(s.check_out_time) AS check_out_time,
                    MAX(s.total_hours) AS total_hours,
                    MAX(CASE WHEN s.status = 'present' THEN 1 ELSE 0 END) AS has_present,
                    MAX(CASE WHEN s.is_late THEN 1 ELSE 0 END) AS is_late,
                    MAX(s.late_minutes) AS late_minutes
                FROM attendance_sessions AS s
                GROUP BY s.organization_id, s.person_id, s.date
            )
            INSERT INTO attendance_sessions_v2 (
                id, person_id, member_id, group_id, date, check_in_time, check_out_time,
                total_hours, status, is_late, late_minutes, notes, organization_id,
                cloud_id, version, last_modified_at, is_deleted
            )
            SELECT
                s.id,
                s.person_id,
                {_member_key_expr("m")} AS member_id,
                s.group_id,
                s.date,
                r.check_in_time,
                r.check_out_time,
                CASE
                    WHEN r.total_hours IS NOT NULL THEN r.total_hours
                    WHEN r.check_in_time IS NOT NULL AND r.check_out_time IS NOT NULL
                    THEN (julianday(r.check_out_time) - julianday(r.check_in_time)) * 24.0
                    ELSE NULL
                END,
                CASE
                    WHEN r.has_present = 1 THEN 'present'
                    ELSE s.status
                END,
                r.is_late,
                CASE
                    WHEN r.is_late = 1 THEN r.late_minutes
                    ELSE NULL
                END,
                s.notes,
                s.organization_id,
                s.cloud_id,
                s.version,
                s.last_modified_at,
                s.is_deleted
            FROM ranked_sessions AS s
            JOIN session_rollups AS r
              ON (
                  (r.organization_id = s.organization_id)
                  OR (r.organization_id IS NULL AND s.organization_id IS NULL)
             )
             AND r.person_id = s.person_id
             AND r.date = s.date
            JOIN attendance_members_old AS m
              ON m.person_id = s.person_id
             AND (
                  (m.organization_id = s.organization_id)
                  OR (m.organization_id IS NULL AND s.organization_id IS NULL)
             )
            WHERE s.rn = 1
            """))
    op.drop_table("attendance_sessions")
    op.rename_table("attendance_sessions_v2", "attendance_sessions")
    op.create_index(
        "ix_session_group_id", "attendance_sessions", ["group_id"], unique=False
    )
    op.create_index(
        "ix_session_person_id", "attendance_sessions", ["person_id"], unique=False
    )
    op.create_index(
        "ix_session_member_id", "attendance_sessions", ["member_id"], unique=False
    )
    op.create_index("ix_session_date", "attendance_sessions", ["date"], unique=False)
    op.create_index(
        "ix_session_group_date",
        "attendance_sessions",
        ["group_id", "date"],
        unique=False,
    )
    op.create_index(
        "ux_session_member_date",
        "attendance_sessions",
        ["member_id", "date"],
        unique=True,
    )
    op.create_index(
        "ix_attendance_sessions_organization_id",
        "attendance_sessions",
        ["organization_id"],
        unique=False,
    )
    op.create_index(
        "ix_attendance_sessions_cloud_id",
        "attendance_sessions",
        ["cloud_id"],
        unique=False,
    )

    op.create_table(
        "faces_v2",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("person_id", sa.String(), nullable=False),
        sa.Column("embedding", sa.LargeBinary(), nullable=False),
        sa.Column("embedding_dimension", sa.Integer(), nullable=False),
        sa.Column("hash", sa.String(), nullable=True),
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
        sa.PrimaryKeyConstraint("id"),
    )
    op.execute(sa.text(f"""
            INSERT INTO faces_v2 (
                id, person_id, embedding, embedding_dimension, hash, created_at,
                organization_id, cloud_id, version, last_modified_at, is_deleted
            )
            SELECT
                {_face_key_expr("f")} AS id,
                f.person_id,
                f.embedding,
                f.embedding_dimension,
                f.hash,
                f.created_at,
                f.organization_id,
                f.cloud_id,
                f.version,
                f.last_modified_at,
                f.is_deleted
            FROM faces AS f
            """))
    op.drop_table("faces")
    op.rename_table("faces_v2", "faces")
    op.create_index("ix_face_person_id", "faces", ["person_id"], unique=False)
    op.create_index("ix_faces_hash", "faces", ["hash"], unique=False)
    op.create_index(
        "ux_face_person_global",
        "faces",
        ["person_id"],
        unique=True,
        sqlite_where=sa.text("organization_id IS NULL"),
    )
    op.create_index(
        "ux_face_person_org",
        "faces",
        ["person_id", "organization_id"],
        unique=True,
        sqlite_where=sa.text("organization_id IS NOT NULL"),
    )
    op.create_index(
        "ix_faces_organization_id", "faces", ["organization_id"], unique=False
    )
    op.create_index("ix_faces_cloud_id", "faces", ["cloud_id"], unique=False)

    op.drop_table("attendance_members_old")


def downgrade() -> None:
    raise NotImplementedError(
        "Downgrading org-scoped person identity refactor is not supported."
    )

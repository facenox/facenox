"""Persist explicit attendance corrections independently of optional notes."""

from alembic import op
import sqlalchemy as sa

revision = "q2r3s4t5u6v7"
down_revision = "p1q2r3s4t5u6"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "attendance_sessions",
        sa.Column(
            "is_manual_override",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.add_column(
        "attendance_sessions",
        sa.Column("provenance_updated_at_utc", sa.DateTime(), nullable=True),
    )
    # Metadata-only backfills must not fire the ordinary edit-time trigger.
    # Preserve its exact installed definition instead of weakening the
    # generation store's verification of every existing data column.
    update_trigger = (
        op.get_bind()
        .execute(
            sa.text("""
        SELECT sql FROM sqlite_master
        WHERE type = 'trigger' AND name = 'attendance_sessions_utc_update'
    """)
        )
        .scalar_one_or_none()
    )
    if update_trigger:
        op.execute("DROP TRIGGER attendance_sessions_utc_update")
    # Existing reasons and the administrative audit trail are evidence of an
    # override, including corrections that supplied no note.
    op.execute("""
        UPDATE attendance_sessions SET is_manual_override = 1
        WHERE NULLIF(trim(notes), '') IS NOT NULL OR EXISTS (
            SELECT 1 FROM audit_logs a
            WHERE a.action = 'ATTENDANCE_SESSION_OVERRIDDEN'
              AND a.target_type = 'attendance_session'
              AND a.target_id = attendance_sessions.id
              AND a.organization_id IS attendance_sessions.organization_id
        )
    """)
    # Resend recorded modes as well as overrides through bounded delta chunks.
    # A separate watermark preserves all pre-migration timestamps and satisfies
    # the generation store's unchanged-content contract for existing columns.
    op.execute("""
        UPDATE attendance_sessions SET provenance_updated_at_utc = CURRENT_TIMESTAMP
        WHERE is_manual_override = 1 OR applied_rule_id IS NOT NULL
    """)
    if update_trigger:
        op.execute(sa.text(update_trigger))


def downgrade():
    raise RuntimeError(
        "Manual correction provenance must not be discarded by a downgrade."
    )

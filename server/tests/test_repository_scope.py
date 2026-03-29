from datetime import datetime

import pytest
from sqlalchemy import select

from database.models import AttendanceSettings
from database.repository import AttendanceRepository, FaceRepository


@pytest.mark.asyncio
async def test_org_settings_clone_global_defaults_and_stay_isolated(
    async_session_factory,
) -> None:
    async with async_session_factory() as session:
        global_repo = AttendanceRepository(session)
        org_repo = AttendanceRepository(session, organization_id="org-1")

        global_settings = await global_repo.get_settings()
        await global_repo.update_settings(
            {
                "late_threshold_minutes": 22,
                "enable_liveness_detection": False,
            }
        )

        org_settings = await org_repo.get_settings()
        assert org_settings.organization_id == "org-1"
        assert global_settings.id != org_settings.id
        assert org_settings.late_threshold_minutes == 22
        assert org_settings.enable_liveness_detection is False

        await org_repo.update_settings({"late_threshold_minutes": 7})

        refreshed_org = await org_repo.get_settings()
        refreshed_global = await global_repo.get_settings()
        assert refreshed_org.late_threshold_minutes == 7
        assert refreshed_global.late_threshold_minutes == 22

        result = await session.execute(
            select(AttendanceSettings).where(
                AttendanceSettings.organization_id == "org-1"
            )
        )
        assert len(result.scalars().all()) == 1


@pytest.mark.asyncio
async def test_records_sessions_and_groups_are_filtered_by_org(
    async_session_factory,
) -> None:
    async with async_session_factory() as session:
        org_one = AttendanceRepository(session, organization_id="org-1")
        org_two = AttendanceRepository(session, organization_id="org-2")

        await org_one.create_group({"id": "group-1", "name": "Group One"})
        await org_two.create_group({"id": "group-2", "name": "Group Two"})

        await org_one.add_member(
            {
                "person_id": "shared-id",
                "group_id": "group-1",
                "name": "Alice",
            }
        )
        await org_two.add_member(
            {
                "person_id": "shared-id",
                "group_id": "group-2",
                "name": "Bob",
            }
        )

        await org_one.add_record(
            {
                "id": "record-1",
                "person_id": "shared-id",
                "group_id": "group-1",
                "timestamp": datetime(2026, 3, 25, 9, 0, 0),
                "confidence": 0.99,
            }
        )
        await org_two.add_record(
            {
                "id": "record-2",
                "person_id": "shared-id",
                "group_id": "group-2",
                "timestamp": datetime(2026, 3, 25, 10, 0, 0),
                "confidence": 0.97,
            }
        )

        await org_one.upsert_session(
            {
                "id": "session-1",
                "person_id": "shared-id",
                "group_id": "group-1",
                "date": "2026-03-25",
                "status": "present",
            }
        )
        await org_two.upsert_session(
            {
                "id": "session-2",
                "person_id": "shared-id",
                "group_id": "group-2",
                "date": "2026-03-25",
                "status": "present",
            }
        )

        groups_one = await org_one.get_groups(active_only=False)
        groups_two = await org_two.get_groups(active_only=False)
        records_one = await org_one.get_records()
        records_two = await org_two.get_records()
        sessions_one = await org_one.get_sessions()
        sessions_two = await org_two.get_sessions()

        assert [group.id for group in groups_one] == ["group-1"]
        assert [group.id for group in groups_two] == ["group-2"]
        assert [record.person_id for record in records_one] == ["shared-id"]
        assert [record.person_id for record in records_two] == ["shared-id"]
        assert [
            attendance_session.person_id for attendance_session in sessions_one
        ] == ["shared-id"]
        assert [
            attendance_session.person_id for attendance_session in sessions_two
        ] == ["shared-id"]


@pytest.mark.asyncio
async def test_group_updates_append_effective_dated_rule_history(
    async_session_factory,
) -> None:
    async with async_session_factory() as session:
        repo = AttendanceRepository(session, organization_id="org-1")

        group = await repo.create_group(
            {
                "id": "group-1",
                "name": "Group One",
                "settings": {
                    "late_threshold_minutes": 10,
                    "late_threshold_enabled": True,
                    "class_start_time": "08:00",
                    "track_checkout": False,
                },
            }
        )

        initial_rules = await repo.get_group_rules(group.id)
        assert len(initial_rules) == 1
        assert initial_rules[0].late_threshold_minutes == 10
        assert initial_rules[0].class_start_time == "08:00"

        await repo.update_group(
            group.id,
            {
                "settings": {
                    "late_threshold_minutes": 15,
                    "late_threshold_enabled": True,
                    "class_start_time": "08:30",
                    "track_checkout": True,
                }
            },
        )

        updated_rules = await repo.get_group_rules(group.id)
        assert len(updated_rules) == 2
        assert updated_rules[-1].late_threshold_minutes == 15
        assert updated_rules[-1].class_start_time == "08:30"
        assert updated_rules[-1].track_checkout is True


@pytest.mark.asyncio
async def test_duplicate_person_id_across_orgs_is_supported(
    async_session_factory,
) -> None:
    async with async_session_factory() as session:
        org_one = AttendanceRepository(session, organization_id="org-1")
        org_two = AttendanceRepository(session, organization_id="org-2")

        await org_one.create_group({"id": "group-1", "name": "Group One"})
        await org_two.create_group({"id": "group-2", "name": "Group Two"})

        await org_one.add_member(
            {
                "person_id": "shared-id",
                "group_id": "group-1",
                "name": "Alice",
            }
        )

        member_two = await org_two.add_member(
            {
                "person_id": "shared-id",
                "group_id": "group-2",
                "name": "Bob",
            }
        )

        assert member_two.id != (await org_one.get_member("shared-id")).id
        assert (await org_one.get_member("shared-id")).group_id == "group-1"
        assert (await org_two.get_member("shared-id")).group_id == "group-2"


@pytest.mark.asyncio
async def test_duplicate_face_person_id_across_orgs_is_supported(
    async_session_factory,
) -> None:
    async with async_session_factory() as session:
        repo_one = FaceRepository(session, organization_id="org-1")
        repo_two = FaceRepository(session, organization_id="org-2")

        face_one = await repo_one.upsert_face("shared-id", b"a", 1)
        face_two = await repo_two.upsert_face("shared-id", b"b", 1)

        assert face_one.id != face_two.id
        assert (await repo_one.get_face("shared-id")).embedding == b"a"
        assert (await repo_two.get_face("shared-id")).embedding == b"b"


@pytest.mark.asyncio
async def test_rename_person_id_is_scoped_to_one_org(async_session_factory) -> None:
    async with async_session_factory() as session:
        org_one = AttendanceRepository(session, organization_id="org-1")
        org_two = AttendanceRepository(session, organization_id="org-2")

        await org_one.create_group({"id": "group-1", "name": "Group One"})
        await org_two.create_group({"id": "group-2", "name": "Group Two"})

        await org_one.add_member(
            {"person_id": "shared-id", "group_id": "group-1", "name": "Alice"}
        )
        await org_two.add_member(
            {"person_id": "shared-id", "group_id": "group-2", "name": "Bob"}
        )

        await org_one.add_record(
            {
                "id": "record-1",
                "person_id": "shared-id",
                "group_id": "group-1",
                "timestamp": datetime(2026, 3, 25, 9, 0, 0),
                "confidence": 0.99,
            }
        )
        await org_one.upsert_session(
            {
                "id": "session-1",
                "person_id": "shared-id",
                "group_id": "group-1",
                "date": "2026-03-25",
                "status": "present",
            }
        )

        renamed = await org_one.rename_person_id("shared-id", "renamed-id")
        assert renamed is True

        assert await org_one.get_member("shared-id") is None
        assert (await org_one.get_member("renamed-id")).name == "Alice"
        assert (await org_two.get_member("shared-id")).name == "Bob"
        assert [record.person_id for record in await org_one.get_records()] == [
            "renamed-id"
        ]
        assert [session.person_id for session in await org_one.get_sessions()] == [
            "renamed-id"
        ]

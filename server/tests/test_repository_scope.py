import unittest
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from database.models import Base, AttendanceSettings
from database.repository import AttendanceRepository, FaceRepository


class AttendanceRepositoryScopeTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        self.Session = async_sessionmaker(self.engine, expire_on_commit=False)

    async def asyncTearDown(self) -> None:
        await self.engine.dispose()

    async def test_org_settings_clone_global_defaults_and_stay_isolated(self) -> None:
        async with self.Session() as session:
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
            self.assertEqual(org_settings.organization_id, "org-1")
            self.assertNotEqual(global_settings.id, org_settings.id)
            self.assertEqual(org_settings.late_threshold_minutes, 22)
            self.assertFalse(org_settings.enable_liveness_detection)

            await org_repo.update_settings({"late_threshold_minutes": 7})

            refreshed_org = await org_repo.get_settings()
            refreshed_global = await global_repo.get_settings()
            self.assertEqual(refreshed_org.late_threshold_minutes, 7)
            self.assertEqual(refreshed_global.late_threshold_minutes, 22)

            result = await session.execute(
                select(AttendanceSettings).where(
                    AttendanceSettings.organization_id == "org-1"
                )
            )
            self.assertEqual(len(result.scalars().all()), 1)

    async def test_records_sessions_and_groups_are_filtered_by_org(self) -> None:
        async with self.Session() as session:
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

            self.assertEqual([group.id for group in groups_one], ["group-1"])
            self.assertEqual([group.id for group in groups_two], ["group-2"])
            self.assertEqual(
                [record.person_id for record in records_one], ["shared-id"]
            )
            self.assertEqual(
                [record.person_id for record in records_two], ["shared-id"]
            )
            self.assertEqual(
                [attendance_session.person_id for attendance_session in sessions_one],
                ["shared-id"],
            )
            self.assertEqual(
                [attendance_session.person_id for attendance_session in sessions_two],
                ["shared-id"],
            )

    async def test_duplicate_person_id_across_orgs_is_supported(self) -> None:
        async with self.Session() as session:
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

            self.assertNotEqual(
                member_two.id, (await org_one.get_member("shared-id")).id
            )
            self.assertEqual(
                (await org_one.get_member("shared-id")).group_id, "group-1"
            )
            self.assertEqual(
                (await org_two.get_member("shared-id")).group_id, "group-2"
            )

    async def test_duplicate_face_person_id_across_orgs_is_supported(self) -> None:
        async with self.Session() as session:
            repo_one = FaceRepository(session, organization_id="org-1")
            repo_two = FaceRepository(session, organization_id="org-2")

            face_one = await repo_one.upsert_face("shared-id", b"a", 1)
            face_two = await repo_two.upsert_face("shared-id", b"b", 1)

            self.assertNotEqual(face_one.id, face_two.id)
            self.assertEqual((await repo_one.get_face("shared-id")).embedding, b"a")
            self.assertEqual((await repo_two.get_face("shared-id")).embedding, b"b")

    async def test_rename_person_id_is_scoped_to_one_org(self) -> None:
        async with self.Session() as session:
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
            self.assertTrue(renamed)

            self.assertIsNone(await org_one.get_member("shared-id"))
            self.assertEqual((await org_one.get_member("renamed-id")).name, "Alice")
            self.assertEqual((await org_two.get_member("shared-id")).name, "Bob")
            self.assertEqual(
                [record.person_id for record in await org_one.get_records()],
                ["renamed-id"],
            )
            self.assertEqual(
                [session.person_id for session in await org_one.get_sessions()],
                ["renamed-id"],
            )


if __name__ == "__main__":
    unittest.main()

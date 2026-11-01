import asyncio
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import AsyncMock

from sqlalchemy import select, func


def setup_group(test_client, set_api_token, org="bulk-org"):
    client, sessions = test_client
    set_api_token("bulk-token")
    headers = {"X-Facenox-Token": "bulk-token", "X-Facenox-Organization": org}
    group = client.post(
        "/attendance/groups", headers=headers, json={"name": "Bulk retries"}
    )
    assert group.status_code == 200, group.text
    return client, sessions, headers, group.json()["id"]


def row(group, name, key):
    return {"group_id": group, "name": name, "creation_id": key}


def send(client, headers, rows):
    response = client.post(
        "/attendance/members/bulk", headers=headers, json={"members": rows}
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_replayed_bulk_has_one_member_and_audit_log_per_creation(
    test_client, set_api_token
):
    from database.models import AuditLog

    client, sessions, headers, group = setup_group(test_client, set_api_token)
    rows = [row(group, "Alice", "a"), row(group, "Bob", "b")]
    first = send(client, headers, rows)
    second = send(client, headers, rows)
    assert first["success_count"] == second["success_count"] == 2
    assert [m["id"] for m in first["members"]] == [m["id"] for m in second["members"]]
    assert [r["creation_id"] for r in second["results"]] == ["a", "b"]
    assert len(client.get("/attendance/members", headers=headers).json()) == 2

    async def audit_count():
        async with sessions() as session:
            return await session.scalar(
                select(func.count())
                .select_from(AuditLog)
                .where(AuditLog.action == "MEMBER_CREATED")
            )

    assert asyncio.run(audit_count()) == 2


def test_overlapping_or_rechunked_retries_do_not_recreate_saved_rows(
    test_client, set_api_token
):
    client, _, headers, group = setup_group(test_client, set_api_token)
    first = send(client, headers, [row(group, "Alice", "a"), row(group, "Bob", "b")])
    second = send(client, headers, [row(group, "Bob", "b"), row(group, "Carol", "c")])
    assert second["members"][0]["id"] == first["members"][1]["id"]
    assert len(client.get("/attendance/members", headers=headers).json()) == 3


def test_changed_creation_payload_fails_only_that_row(test_client, set_api_token):
    client, _, headers, group = setup_group(test_client, set_api_token)
    send(client, headers, [row(group, "Alice", "a")])
    response = send(
        client, headers, [row(group, "Different", "a"), row(group, "Bob", "b")]
    )
    assert response["success_count"] == response["error_count"] == 1
    assert response["results"][0]["creation_id"] == "a"
    assert response["results"][0]["success"] is False
    assert {
        m["name"] for m in client.get("/attendance/members", headers=headers).json()
    } == {"Alice", "Bob"}


def test_repeated_keys_inside_one_request_do_not_add_twice(test_client, set_api_token):
    client, _, headers, group = setup_group(test_client, set_api_token)
    response = send(
        client, headers, [row(group, "Alice", "a"), row(group, "Alice", "a")]
    )
    assert response["success_count"] == 2
    assert response["members"][0]["id"] == response["members"][1]["id"]
    assert len(client.get("/attendance/members", headers=headers).json()) == 1


def test_single_and_bulk_creation_tokens_share_the_same_identity(
    test_client, set_api_token
):
    client, _, headers, group = setup_group(test_client, set_api_token)
    first = client.post(
        "/attendance/members", headers=headers, json=row(group, "Alice", "a")
    )
    assert first.status_code == 200
    bulk = send(client, headers, [row(group, "Alice", "a"), row(group, "Bob", "b")])
    assert bulk["members"][0]["id"] == first.json()["id"]
    assert len(client.get("/attendance/members", headers=headers).json()) == 2


def test_bulk_replay_cannot_restore_a_removed_member(
    test_client, set_api_token, monkeypatch
):
    import core.lifespan

    client, _, headers, group = setup_group(test_client, set_api_token)
    monkeypatch.setattr(core.lifespan.face_recognizer, "refresh_cache", AsyncMock())
    first = send(client, headers, [row(group, "Alice", "a")])
    person = first["members"][0]["person_id"]
    assert (
        client.delete(f"/attendance/members/{person}", headers=headers).status_code
        == 200
    )
    replay = send(client, headers, [row(group, "Alice", "a")])
    assert replay["success_count"] == 0 and replay["error_count"] == 1
    assert client.get("/attendance/members", headers=headers).json() == []


def test_bulk_tokens_are_organization_scoped(test_client, set_api_token):
    client, _, one, first_group = setup_group(test_client, set_api_token, "one")
    _, _, two, second_group = setup_group(test_client, set_api_token, "two")
    first = send(client, one, [row(first_group, "Alice", "same")])
    second = send(client, two, [row(second_group, "Alice", "same")])
    assert first["members"][0]["id"] != second["members"][0]["id"]
    assert len(client.get("/attendance/members", headers=one).json()) == 1
    assert len(client.get("/attendance/members", headers=two).json()) == 1


def test_parallel_overlapping_batches_create_three_not_four_members(
    test_client, set_api_token
):
    client, _, headers, group = setup_group(test_client, set_api_token)
    batches = [
        [row(group, "Alice", "a"), row(group, "Bob", "b")],
        [row(group, "Alice", "a"), row(group, "Carol", "c")],
    ]
    with ThreadPoolExecutor(max_workers=2) as executor:
        responses = list(
            executor.map(lambda rows: send(client, headers, rows), batches)
        )
    assert responses[0]["members"][0]["id"] == responses[1]["members"][0]["id"]
    assert len(client.get("/attendance/members", headers=headers).json()) == 3


def test_legacy_bulk_requests_keep_their_duplicate_person_id_errors(
    test_client, set_api_token
):
    client, _, headers, group = setup_group(test_client, set_api_token)
    rows = [{"group_id": group, "name": "Alice", "person_id": "legacy-person"}]
    assert send(client, headers, rows)["success_count"] == 1
    replay = send(client, headers, rows)
    assert replay["error_count"] == 1 and replay["success_count"] == 0


def test_large_replay_uses_batched_identity_lookups(test_client, set_api_token):
    client, _, headers, group = setup_group(test_client, set_api_token)
    rows = [row(group, f"Member {i}", f"key-{i}") for i in range(502)]
    assert send(client, headers, rows)["success_count"] == 502
    assert send(client, headers, rows)["success_count"] == 502
    assert len(client.get("/attendance/members", headers=headers).json()) == 502

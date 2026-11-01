import asyncio
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from sqlalchemy.exc import IntegrityError


def setup_group(test_client, set_api_token, org="creation-org"):
    client, _ = test_client
    set_api_token("creation-token")
    headers = {"X-Facenox-Token": "creation-token", "X-Facenox-Organization": org}
    response = client.post(
        "/attendance/groups", headers=headers, json={"name": "Retry group"}
    )
    assert response.status_code == 200, response.text
    return client, headers, response.json()["id"]


def test_creation_replay_returns_one_persisted_member(test_client, set_api_token):
    client, headers, group_id = setup_group(test_client, set_api_token)
    payload = {"group_id": group_id, "name": "Alice", "creation_id": "one-request"}
    first = client.post("/attendance/members", headers=headers, json=payload)
    second = client.post("/attendance/members", headers=headers, json=payload)
    assert first.status_code == second.status_code == 200, second.text
    assert first.json()["id"] == second.json()["id"]
    assert first.json()["person_id"] == second.json()["person_id"]
    members = client.get("/attendance/members", headers=headers).json()
    assert len(members) == 1


def test_parallel_retries_create_only_one_database_member(test_client, set_api_token):
    client, headers, group_id = setup_group(test_client, set_api_token)
    payload = {"group_id": group_id, "name": "Alice", "creation_id": "parallel-request"}
    with ThreadPoolExecutor(max_workers=2) as executor:
        responses = list(
            executor.map(
                lambda _: client.post(
                    "/attendance/members", headers=headers, json=payload
                ),
                range(2),
            )
        )
    assert [response.status_code for response in responses] == [200, 200]
    assert responses[0].json()["id"] == responses[1].json()["id"]
    assert len(client.get("/attendance/members", headers=headers).json()) == 1


@pytest.mark.parametrize(
    "field,value",
    [("name", "Bob"), ("role", "Other role"), ("person_id", "other-person")],
)
def test_creation_key_cannot_be_reused_for_changed_payload(
    test_client, set_api_token, field, value
):
    client, headers, group_id = setup_group(test_client, set_api_token)
    payload = {"group_id": group_id, "name": "Alice", "creation_id": "one-request"}
    assert (
        client.post("/attendance/members", headers=headers, json=payload).status_code
        == 200
    )
    response = client.post(
        "/attendance/members", headers=headers, json={**payload, field: value}
    )
    assert response.status_code == 409, response.text
    assert len(client.get("/attendance/members", headers=headers).json()) == 1


def test_replay_does_not_resurrect_a_removed_member(
    test_client, set_api_token, monkeypatch
):
    client, headers, group_id = setup_group(test_client, set_api_token)
    import core.lifespan

    monkeypatch.setattr(core.lifespan.face_recognizer, "refresh_cache", AsyncMock())
    payload = {"group_id": group_id, "name": "Alice", "creation_id": "one-request"}
    first = client.post("/attendance/members", headers=headers, json=payload).json()
    assert (
        client.delete(
            f"/attendance/members/{first['person_id']}", headers=headers
        ).status_code
        == 200
    )
    response = client.post("/attendance/members", headers=headers, json=payload)
    assert response.status_code == 409, response.text
    assert client.get("/attendance/members", headers=headers).json() == []


@pytest.mark.parametrize(
    "scopes",
    [(("org-one", "same-key"), ("org-two", "same-key")), (("a", "b:c"), ("a:b", "c"))],
)
def test_creation_keys_are_scoped_to_the_organization(
    test_client, set_api_token, scopes
):
    client, first_headers, first_group = setup_group(
        test_client, set_api_token, scopes[0][0]
    )
    _, second_headers, second_group = setup_group(
        test_client, set_api_token, scopes[1][0]
    )
    saved = []
    for headers, group_id, key in [
        (first_headers, first_group, scopes[0][1]),
        (second_headers, second_group, scopes[1][1]),
    ]:
        response = client.post(
            "/attendance/members",
            headers=headers,
            json={"group_id": group_id, "name": "Alice", "creation_id": key},
        )
        assert response.status_code == 200, response.text
        saved.append(response.json())
        assert len(client.get("/attendance/members", headers=headers).json()) == 1
    assert saved[0]["id"] != saved[1]["id"]


def test_legacy_requests_and_intentional_duplicate_names_still_work(
    test_client, set_api_token
):
    client, headers, group_id = setup_group(test_client, set_api_token)
    payload = {"group_id": group_id, "name": "Alice"}
    first = client.post("/attendance/members", headers=headers, json=payload)
    second = client.post("/attendance/members", headers=headers, json=payload)
    assert first.status_code == second.status_code == 200
    assert first.json()["person_id"] != second.json()["person_id"]
    duplicate_id = client.post(
        "/attendance/members",
        headers=headers,
        json={**payload, "person_id": first.json()["person_id"]},
    )
    assert duplicate_id.status_code == 400


def test_concurrent_creation_constraint_replays_the_winning_member():
    from api.routes.members import add_member
    from api.schemas import AttendanceMemberCreateRequest

    winner = SimpleNamespace(
        is_deleted=False,
        is_active=True,
        group_id="g",
        name="Alice",
        role=None,
        email=None,
        person_id="p",
    )
    repo = SimpleNamespace(
        organization_id="org",
        get_group=AsyncMock(return_value=SimpleNamespace(id="g")),
        get_member_by_id=AsyncMock(side_effect=[None, winner]),
        get_member=AsyncMock(return_value=None),
        add_member=AsyncMock(return_value=winner),
        add_audit_log=AsyncMock(),
        session=SimpleNamespace(
            commit=AsyncMock(
                side_effect=IntegrityError("INSERT", {}, Exception("conflict"))
            ),
            rollback=AsyncMock(),
        ),
    )
    result = asyncio.run(
        add_member(
            AttendanceMemberCreateRequest(
                group_id="g", name="Alice", person_id="p", creation_id="key"
            ),
            repo,
        )
    )
    assert result is winner
    repo.session.rollback.assert_awaited_once()
    assert repo.get_member_by_id.await_count == 2

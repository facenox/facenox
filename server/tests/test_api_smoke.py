from starlette.websockets import WebSocketDisconnect


def _headers(organization_id: str) -> dict[str, str]:
    return {
        "X-Facenox-Token": "smoke-token",
        "X-Facenox-Organization": organization_id,
    }


def test_org_scoped_http_flow_supports_same_person_id_across_orgs(
    test_client, set_api_token
) -> None:
    client, _session_factory = test_client
    set_api_token("smoke-token")

    org_one_headers = _headers("org-one")
    org_two_headers = _headers("org-two")

    group_one = client.post(
        "/attendance/groups",
        headers=org_one_headers,
        json={"name": "Org One Group"},
    )
    assert group_one.status_code == 200, group_one.text
    group_one_id = group_one.json()["id"]

    group_two = client.post(
        "/attendance/groups",
        headers=org_two_headers,
        json={"name": "Org Two Group"},
    )
    assert group_two.status_code == 200, group_two.text
    group_two_id = group_two.json()["id"]

    member_one = client.post(
        "/attendance/members",
        headers=org_one_headers,
        json={
            "person_id": "shared-person",
            "group_id": group_one_id,
            "name": "Alice Org One",
            "has_consent": True,
            "consent_granted_by": "smoke-test",
        },
    )
    assert member_one.status_code == 200, member_one.text

    member_two = client.post(
        "/attendance/members",
        headers=org_two_headers,
        json={
            "person_id": "shared-person",
            "group_id": group_two_id,
            "name": "Bob Org Two",
            "has_consent": True,
            "consent_granted_by": "smoke-test",
        },
    )
    assert member_two.status_code == 200, member_two.text

    fetched_one = client.get(
        "/attendance/members/shared-person", headers=org_one_headers
    )
    fetched_two = client.get(
        "/attendance/members/shared-person", headers=org_two_headers
    )
    assert fetched_one.status_code == 200, fetched_one.text
    assert fetched_two.status_code == 200, fetched_two.text
    assert fetched_one.json()["name"] == "Alice Org One"
    assert fetched_two.json()["name"] == "Bob Org Two"
    assert fetched_one.json()["group_id"] == group_one_id
    assert fetched_two.json()["group_id"] == group_two_id

    event_one = client.post(
        "/attendance/events",
        headers=org_one_headers,
        json={
            "person_id": "shared-person",
            "confidence": 0.99,
            "location": "camera-one",
        },
    )
    event_two = client.post(
        "/attendance/events",
        headers=org_two_headers,
        json={
            "person_id": "shared-person",
            "confidence": 0.97,
            "location": "camera-two",
        },
    )
    assert event_one.status_code == 200, event_one.text
    assert event_two.status_code == 200, event_two.text
    assert event_one.json()["processed"] is True
    assert event_two.json()["processed"] is True
    assert event_one.json()["group_id"] == group_one_id
    assert event_two.json()["group_id"] == group_two_id

    records_one = client.get("/attendance/records", headers=org_one_headers)
    records_two = client.get("/attendance/records", headers=org_two_headers)
    assert records_one.status_code == 200, records_one.text
    assert records_two.status_code == 200, records_two.text
    assert len(records_one.json()) == 1
    assert len(records_two.json()) == 1
    assert records_one.json()[0]["group_id"] == group_one_id
    assert records_two.json()[0]["group_id"] == group_two_id

    export_one = client.post("/attendance/export", headers=org_one_headers)
    export_two = client.post("/attendance/export", headers=org_two_headers)
    assert export_one.status_code == 200, export_one.text
    assert export_two.status_code == 200, export_two.text

    export_one_data = export_one.json()
    export_two_data = export_two.json()
    assert [group["id"] for group in export_one_data["groups"]] == [group_one_id]
    assert [group["id"] for group in export_two_data["groups"]] == [group_two_id]
    assert [member["name"] for member in export_one_data["members"]] == [
        "Alice Org One"
    ]
    assert [member["name"] for member in export_two_data["members"]] == ["Bob Org Two"]
    assert [record["location"] for record in export_one_data["records"]] == [
        "camera-one"
    ]
    assert [record["location"] for record in export_two_data["records"]] == [
        "camera-two"
    ]
    assert [session["group_id"] for session in export_one_data["sessions"]] == [
        group_one_id
    ]
    assert [session["group_id"] for session in export_two_data["sessions"]] == [
        group_two_id
    ]


def test_detect_websocket_requires_token_and_accepts_scoped_client(
    test_client, set_api_token
) -> None:
    client, _session_factory = test_client
    set_api_token("smoke-token")

    try:
        with client.websocket_connect(
            "/ws/detect/unauthorized-client?organization_id=org-ws"
        ):
            raise AssertionError("Unauthorized websocket unexpectedly connected")
    except WebSocketDisconnect as exc:
        assert exc.code == 1008

    client_id = "authorized-client"

    from utils.websocket_manager import manager

    manager.face_trackers[client_id] = object()

    with client.websocket_connect(
        f"/ws/detect/{client_id}?token=smoke-token&organization_id=org-ws"
    ) as websocket:
        connection_message = websocket.receive_json()
        assert connection_message["type"] == "connection"
        assert connection_message["client_id"] == client_id

        websocket.send_json({"type": "ping"})
        pong_message = websocket.receive_json()
        assert pong_message["type"] == "pong"
        assert pong_message["client_id"] == client_id

        websocket.send_json({"type": "disconnect"})

    assert client_id not in manager.active_connections

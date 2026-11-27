from services.live_stream_service import LiveSessionConfig, LiveStreamService


def test_cloud_requirement_cannot_be_disabled_by_a_live_client():
    service = LiveStreamService("policy-org")
    config = LiveSessionConfig(organization_id="policy-org")
    LiveStreamService.register_config(config)
    try:
        LiveStreamService.apply_liveness_policy("policy-org", True, False)
        service.apply_config_message(config, {"enable_liveness_detection": False})
        assert config.force_liveness_detection is True
        assert config.enable_liveness_detection is True
        assert config.requested_liveness_detection is False
        LiveStreamService.apply_liveness_policy("policy-org", False, False)
        assert config.enable_liveness_detection is False
    finally:
        LiveStreamService.unregister_config(config)


def test_releasing_a_requirement_preserves_an_enabled_local_preference():
    config = LiveSessionConfig(organization_id="preferred-org")
    other = LiveSessionConfig(organization_id="other-org")
    LiveStreamService.register_config(config)
    LiveStreamService.register_config(other)
    try:
        LiveStreamService.apply_liveness_policy("preferred-org", True, True)
        LiveStreamService.apply_liveness_policy("preferred-org", False, True)
        assert config.enable_liveness_detection is True
        assert other.force_liveness_detection is False
    finally:
        LiveStreamService.unregister_config(config)
        LiveStreamService.unregister_config(other)


def test_policy_is_persisted_separately_from_the_local_preference(
    test_client, set_api_token
):
    client, _ = test_client
    set_api_token("liveness-policy")
    headers = {"X-Facenox-Token": "liveness-policy"}
    response = client.put(
        "/attendance/settings",
        headers=headers,
        json={"enable_liveness_detection": False},
    )
    assert response.status_code == 200
    response = client.put(
        "/attendance/settings/cloud-liveness",
        headers=headers,
        json={"force_liveness_detection": True},
    )
    assert response.status_code == 200, response.text
    assert response.json()["cloud_force_liveness"] is True
    response = client.put(
        "/attendance/settings",
        headers=headers,
        json={"enable_liveness_detection": False, "cloud_force_liveness": False},
    )
    assert response.status_code == 200, response.text
    assert response.json()["cloud_force_liveness"] is True
    assert response.json()["enable_liveness_detection"] is False
    response = client.put(
        "/attendance/settings/cloud-liveness",
        headers=headers,
        json={"force_liveness_detection": False},
    )
    assert response.status_code == 200, response.text
    response = client.get("/attendance/settings", headers=headers)
    assert response.json()["cloud_force_liveness"] is False
    assert response.json()["enable_liveness_detection"] is False
    client.put(
        "/attendance/settings/cloud-liveness",
        headers=headers,
        json={"force_liveness_detection": True},
    )
    response = client.post("/attendance/unpair", headers=headers)
    assert response.status_code == 200, response.text
    response = client.get("/attendance/settings", headers=headers)
    assert response.json()["cloud_force_liveness"] is False
    assert response.json()["enable_liveness_detection"] is False


def test_face_recognize_endpoint_enforces_cloud_force_liveness(
    test_client, set_api_token, monkeypatch
):
    import json
    import cv2
    import numpy as np
    import api.routes.recognition as recognition_route

    client, _ = test_client
    set_api_token("liveness-recognize")
    headers = {
        "X-Facenox-Token": "liveness-recognize",
        "X-Facenox-Organization": "recognize-policy-org",
    }

    r = client.put(
        "/attendance/settings/cloud-liveness",
        headers=headers,
        json={"force_liveness_detection": True},
    )
    assert r.status_code == 200, r.text

    seen_liveness = []

    async def fake_detect(*_args, **_kwargs):
        return [{"bbox": [8, 12, 42, 36], "confidence": 0.99}]

    async def fake_liveness(_img, _bbox, enable_liveness, _op):
        seen_liveness.append(enable_liveness)
        if enable_liveness:
            return True, "Spoof detected", {"status": "spoof"}
        return False, None, {"status": "skipped"}

    class FakeRecognizer:
        async def recognize_face(self, *_args, **_kwargs):
            return {"success": True, "person_id": "p1", "similarity": 0.99}

    monkeypatch.setattr(recognition_route, "process_face_detection", fake_detect)
    monkeypatch.setattr(
        recognition_route, "process_liveness_for_face_operation", fake_liveness
    )
    client.app.dependency_overrides[recognition_route.get_face_recognizer] = lambda: (
        FakeRecognizer()
    )

    try:
        ok, buf = cv2.imencode(".jpg", np.zeros((64, 64, 3), dtype=np.uint8))
        assert ok
        res = client.post(
            "/face/recognize",
            headers=headers,
            data={
                "metadata": json.dumps(
                    {
                        "bbox": [8, 12, 42, 36],
                        "landmarks_5": [
                            [10, 10],
                            [30, 10],
                            [20, 20],
                            [12, 30],
                            [28, 30],
                        ],
                        "group_id": "all",
                        "enable_liveness_detection": False,
                    }
                )
            },
            files={"image": ("face.jpg", buf.tobytes(), "image/jpeg")},
        )
        assert res.status_code == 200, res.text
        assert seen_liveness == [True]
        assert res.json()["success"] is False
        assert res.json()["error"] == "Spoof detected"
    finally:
        client.app.dependency_overrides.pop(recognition_route.get_face_recognizer, None)

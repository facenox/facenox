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

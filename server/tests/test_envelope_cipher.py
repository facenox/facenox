from core import cipher


def test_envelope_creation_generates_recovery_file_and_file_vault(tmp_path):
    data_dir = tmp_path / "data"
    data_dir.mkdir(parents=True)

    record = cipher.get_machine_key_record(create_if_missing=True, data_dir=data_dir)
    assert record.provider == "envelope"
    assert len(record.key) == 32

    rec_file = data_dir / "RECOVERY_KEY.txt"
    assert rec_file.exists()
    assert "Recovery Key: FNX-" in rec_file.read_text(encoding="utf-8")

    file_vault_key = data_dir / ".machine_key"
    assert file_vault_key.exists()
    assert len(file_vault_key.read_bytes()) == 32

    metadata = cipher._read_provider(data_dir)
    assert metadata["format"] == 2
    assert metadata["provider"] == "envelope"
    assert metadata["key_id"] == record.key_id
    envelope = metadata["envelope"]
    assert "wrapped_file" in envelope
    assert "wrapped_recovery" in envelope
    assert envelope["recovery_preview"].startswith("FNX-****-****-")


def test_envelope_unwraps_cleanly_via_file_vault_when_keyring_fails(
    tmp_path, monkeypatch
):
    data_dir = tmp_path / "data"
    data_dir.mkdir(parents=True)

    record_initial = cipher.get_machine_key_record(
        create_if_missing=True, data_dir=data_dir
    )
    original_key = record_initial.key

    monkeypatch.setattr(cipher, "_CACHED_MACHINE_KEY", None)
    monkeypatch.setattr(cipher, "_CACHED_MACHINE_PROVIDER", None)
    monkeypatch.setattr(cipher, "_CACHED_MACHINE_DATA_DIR", None)

    def fail_keyring(*args, **kwargs):
        raise cipher.MachineKeyUnavailableError("KDE Wallet is locked or missing.")

    monkeypatch.setattr(cipher, "_machine_key_linux_keyring", fail_keyring)

    record_reboot = cipher.get_machine_key_record(
        create_if_missing=False, data_dir=data_dir
    )
    assert record_reboot.provider == "envelope"
    assert record_reboot.key == original_key
    assert record_reboot.key_id == record_initial.key_id


def test_disaster_recovery_via_master_recovery_key_on_foreign_machine(
    tmp_path, monkeypatch
):
    data_dir = tmp_path / "data"
    data_dir.mkdir(parents=True)

    record_orig = cipher.get_machine_key_record(
        create_if_missing=True, data_dir=data_dir
    )
    original_key = record_orig.key

    rec_file = data_dir / "RECOVERY_KEY.txt"
    recovery_key = None
    for line in rec_file.read_text(encoding="utf-8").splitlines():
        if "Recovery Key:" in line:
            recovery_key = line.split(":", 1)[1].strip()
            break
    assert recovery_key is not None

    (data_dir / ".machine_key").unlink()

    def fail_keyring(*args, **kwargs):
        raise cipher.MachineKeyUnavailableError("No keyring on foreign machine.")

    monkeypatch.setattr(cipher, "_machine_key_linux_keyring", fail_keyring)
    monkeypatch.setattr(cipher, "_CACHED_MACHINE_KEY", None)
    monkeypatch.setattr(cipher, "_CACHED_MACHINE_PROVIDER", None)
    monkeypatch.setattr(cipher, "_CACHED_MACHINE_DATA_DIR", None)

    monkeypatch.setenv("FACENOX_RECOVERY_KEY", recovery_key)

    record_recovered = cipher.get_machine_key_record(
        create_if_missing=False, data_dir=data_dir
    )
    assert record_recovered.key == original_key
    assert record_recovered.key_id == record_orig.key_id

    # Keystores should automatically re-establish on foreign host
    assert (data_dir / ".machine_key").exists()

    monkeypatch.delenv("FACENOX_RECOVERY_KEY")
    monkeypatch.setattr(cipher, "_CACHED_MACHINE_KEY", None)
    monkeypatch.setattr(cipher, "_CACHED_MACHINE_PROVIDER", None)
    monkeypatch.setattr(cipher, "_CACHED_MACHINE_DATA_DIR", None)

    record_auto = cipher.get_machine_key_record(
        create_if_missing=False, data_dir=data_dir
    )
    assert record_auto.key == original_key


def test_legacy_windows_dpapi_discovery_without_metadata(tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    data_dir.mkdir(parents=True)

    fake_dpapi_key = b"W" * 32
    (data_dir / ".machine_key.dpapi").write_bytes(b"encrypted_dpapi_blob")

    monkeypatch.setattr(cipher.platform, "system", lambda: "Windows")
    monkeypatch.setattr(
        cipher,
        "_machine_key_windows",
        lambda *, create_if_missing=True, data_dir=None: fake_dpapi_key,
    )
    monkeypatch.setattr(cipher, "_CACHED_MACHINE_KEY", None)
    monkeypatch.setattr(cipher, "_CACHED_MACHINE_PROVIDER", None)
    monkeypatch.setattr(cipher, "_CACHED_MACHINE_DATA_DIR", None)

    record = cipher.get_machine_key_record(create_if_missing=False, data_dir=data_dir)
    assert record.provider == "windows-dpapi"
    assert record.key == fake_dpapi_key

    # Verifies that it gets pinned into .machine_key.json
    metadata = cipher._read_provider(data_dir)
    assert metadata is not None
    assert metadata["provider"] == "windows-dpapi"
    assert metadata["format"] == 1


def test_legacy_file_discovery_without_metadata(tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    data_dir.mkdir(parents=True)

    fake_file_key = b"F" * 32
    (data_dir / ".machine_key").write_bytes(fake_file_key)

    monkeypatch.setattr(cipher.platform, "system", lambda: "Linux")
    monkeypatch.setattr(cipher, "_CACHED_MACHINE_KEY", None)
    monkeypatch.setattr(cipher, "_CACHED_MACHINE_PROVIDER", None)
    monkeypatch.setattr(cipher, "_CACHED_MACHINE_DATA_DIR", None)

    record = cipher.get_machine_key_record(create_if_missing=False, data_dir=data_dir)
    assert record.provider == "file"
    assert record.key == fake_file_key

    metadata = cipher._read_provider(data_dir)
    assert metadata is not None
    assert metadata["provider"] == "file"
    assert metadata["format"] == 1

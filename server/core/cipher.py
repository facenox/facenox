"""
AES-256-GCM encryption for .facenox backup files.

Blob layout: MAGIC(6) | SALT(16) | IV(12) | TAG(16) | CIPHERTEXT
Key derivation: PBKDF2-HMAC-SHA256, 480k iterations.

Machine key storage (encrypt_local_data / decrypt_local_data):
  Windows : DPAPI (CryptProtectData) tied to the Windows user login.
  macOS   : macOS Keychain via the native keyring backend, with a pinned file fallback.
  Linux   : Secret Service when available, with a pinned 0600 file fallback.
"""

import os
import logging
import platform
import hashlib
import hmac
import base64
import json
import sys
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from config.paths import DATA_DIR

logger = logging.getLogger(__name__)

SALT_SIZE = 16
IV_SIZE = 12
KEY_SIZE = 32
PBKDF2_ITERS = 480_000
FACENOX_MAGIC = b"FACENOX\x00\x01"


def _derive_key(password: str, salt: bytes) -> bytes:
    return hashlib.pbkdf2_hmac(
        "sha256", password.encode(), salt, PBKDF2_ITERS, dklen=KEY_SIZE
    )


def encrypt_backup(plaintext: bytes, password: str) -> bytes:
    """Encrypt plaintext. Returns a self-contained blob ready to write to disk."""
    salt = os.urandom(SALT_SIZE)
    iv = os.urandom(IV_SIZE)
    encrypted = AESGCM(_derive_key(password, salt)).encrypt(iv, plaintext, None)
    return FACENOX_MAGIC + salt + iv + encrypted


def decrypt_backup(blob: bytes, password: str) -> bytes:
    """
    Decrypt a .facenox blob. Raises ValueError on bad format,
    InvalidTag on wrong password or tampered data.
    """
    magic_len = len(FACENOX_MAGIC)
    if len(blob) < magic_len + SALT_SIZE + IV_SIZE + 16 + 1:
        raise ValueError("Not a valid .facenox file.")
    if not hmac.compare_digest(blob[:magic_len], FACENOX_MAGIC):
        raise ValueError("Not a valid .facenox file.")

    o = magic_len
    salt, iv = blob[o : o + SALT_SIZE], blob[o + SALT_SIZE : o + SALT_SIZE + IV_SIZE]
    ciphertext = blob[o + SALT_SIZE + IV_SIZE :]
    return AESGCM(_derive_key(password, salt)).decrypt(iv, ciphertext, None)


KEY_PROVIDER_FILENAME = ".machine_key.json"
KEY_PROVIDER_FORMAT = 1


@dataclass(frozen=True)
class MachineKeyRecord:
    key: bytes
    provider: str
    key_id: str


_CACHED_MACHINE_KEY: Optional[bytes] = None
_CACHED_MACHINE_PROVIDER: Optional[str] = None
_CACHED_MACHINE_DATA_DIR: Optional[Path] = None


def _key_id(key: bytes) -> str:
    return hashlib.sha256(key).hexdigest()


def _canonical_json(value: dict[str, object]) -> bytes:
    return json.dumps(
        value, sort_keys=True, separators=(",", ":"), ensure_ascii=True
    ).encode("utf-8")


def _fsync_directory(path: Path) -> None:
    if sys.platform == "win32":
        return
    descriptor = os.open(path, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _write_secure_file(path: Path, value: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    try:
        with temporary.open("xb") as stream:
            stream.write(value)
            stream.flush()
            os.fsync(stream.fileno())
        if os.name != "nt":
            temporary.chmod(0o600)
        os.replace(temporary, path)
        if os.name != "nt":
            path.chmod(0o600)
        _fsync_directory(path.parent)
    finally:
        temporary.unlink(missing_ok=True)


def _decode_environment_key() -> bytes | None:
    value = os.getenv("FACENOX_MACHINE_KEY")
    if not value:
        return None
    try:
        decoded = base64.b64decode(value.strip(), validate=True)
        if len(decoded) == KEY_SIZE:
            return decoded
    except Exception:
        pass
    try:
        decoded = bytes.fromhex(value.strip())
        if len(decoded) == KEY_SIZE:
            return decoded
    except Exception:
        pass
    raise MachineKeyUnavailableError(
        "FACENOX_MACHINE_KEY must be exactly 32 bytes encoded as Base64 or hex."
    )


UNAMBIGUOUS_RECOVERY_CHARS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"


def _generate_recovery_key() -> str:
    """Generates an unambiguous, human-readable recovery key formatted as FNX-XXXX-XXXX-XXXX."""
    import secrets

    parts = ["FNX"]
    for _ in range(3):
        chunk = "".join(secrets.choice(UNAMBIGUOUS_RECOVERY_CHARS) for _ in range(4))
        parts.append(chunk)
    return "-".join(parts)


def _normalize_recovery_key(key_str: str) -> str:
    return "".join(c for c in key_str.strip().upper() if c.isalnum())


def _derive_recovery_kek(key_str: str, salt: bytes) -> bytes:
    norm = _normalize_recovery_key(key_str)
    return hashlib.pbkdf2_hmac(
        "sha256", norm.encode("utf-8"), salt, 120_000, dklen=KEY_SIZE
    )


def _wrap_key(kek: bytes, target_key: bytes) -> str:
    nonce = os.urandom(IV_SIZE)
    encrypted = AESGCM(kek).encrypt(nonce, target_key, None)
    return base64.b64encode(nonce + encrypted).decode("ascii")


def _unwrap_key(kek: bytes, wrapped_b64: str) -> bytes:
    raw = base64.b64decode(wrapped_b64.strip())
    if len(raw) < IV_SIZE + 16:
        raise ValueError("Invalid wrapped key format.")
    nonce = raw[:IV_SIZE]
    ciphertext = raw[IV_SIZE:]
    return AESGCM(kek).decrypt(nonce, ciphertext, None)


def _provider_payload(
    provider: str, key: bytes, envelope: dict[str, object] | None = None
) -> dict[str, object]:
    payload: dict[str, object] = {
        "format": 2 if envelope is not None else KEY_PROVIDER_FORMAT,
        "provider": provider,
        "key_id": _key_id(key),
    }
    if envelope is not None:
        payload["envelope"] = envelope
    return payload


def _pin_provider(
    data_dir: Path, provider: str, key: bytes, envelope: dict[str, object] | None = None
) -> None:
    payload = _provider_payload(provider, key, envelope=envelope)
    payload["hmac_sha256"] = hmac.new(
        key, b"facenox-key-provider\x00" + _canonical_json(payload), hashlib.sha256
    ).hexdigest()
    _write_secure_file(
        data_dir / KEY_PROVIDER_FILENAME,
        (json.dumps(payload, indent=2, sort_keys=True) + "\n").encode("utf-8"),
    )


def _read_provider(data_dir: Path) -> dict[str, object] | None:
    path = data_dir / KEY_PROVIDER_FILENAME
    if not path.exists():
        return None
    try:
        raw_text = path.read_text(encoding="utf-8").strip()
        if not raw_text:
            return None
        value = json.loads(raw_text)
    except (OSError, json.JSONDecodeError) as exc:
        raise MachineKeyUnavailableError(
            f"Machine-key provider metadata is unreadable: {path}"
        ) from exc
    if not isinstance(value, dict) or value.get("format") not in (1, 2):
        raise MachineKeyUnavailableError(
            f"Machine-key provider metadata is invalid: {path}"
        )
    return value


def _validate_record(
    data_dir: Path, provider: str, key: bytes, metadata: dict[str, object]
) -> MachineKeyRecord:
    if len(key) != KEY_SIZE:
        raise MachineKeyUnavailableError(
            f"Machine key from provider '{provider}' has an invalid length."
        )
    key_id = _key_id(key)
    envelope = (
        metadata.get("envelope") if isinstance(metadata.get("envelope"), dict) else None
    )
    payload = _provider_payload(provider, key, envelope=envelope)
    expected_mac = hmac.new(
        key, b"facenox-key-provider\x00" + _canonical_json(payload), hashlib.sha256
    ).hexdigest()
    if (
        metadata.get("provider") != provider
        or metadata.get("key_id") != key_id
        or not isinstance(metadata.get("hmac_sha256"), str)
        or not hmac.compare_digest(str(metadata["hmac_sha256"]), expected_mac)
    ):
        raise MachineKeyUnavailableError(
            f"Machine-key identity validation failed: {data_dir / KEY_PROVIDER_FILENAME}"
        )
    return MachineKeyRecord(key, provider, key_id)


def _reestablish_envelope_keystores(
    data_dir: Path, dek: bytes, envelope: dict[str, object], metadata: dict[str, object]
) -> None:
    try:
        file_kek = _machine_key_file(create_if_missing=True, data_dir=data_dir)
        envelope["wrapped_file"] = _wrap_key(file_kek, dek)
        try:
            system = platform.system()
            if system == "Linux" and os.environ.get("DBUS_SESSION_BUS_ADDRESS"):
                keyring_kek = _machine_key_linux_keyring(create_if_missing=True)
                envelope["wrapped_keyring"] = _wrap_key(keyring_kek, dek)
        except Exception:
            pass
        _pin_provider(data_dir, "envelope", dek, envelope=envelope)
    except Exception as exc:
        logger.warning("Failed to re-establish local keystores: %s", exc)


def _load_envelope_key(data_dir: Path, metadata: dict[str, object]) -> bytes:
    envelope = metadata.get("envelope")
    if not isinstance(envelope, dict):
        raise MachineKeyUnavailableError(
            "Corrupted envelope metadata in provider configuration."
        )

    expected_key_id = metadata.get("key_id")

    # Try OS Keyring unwrap
    wrapped_keyring = envelope.get("wrapped_keyring")
    if isinstance(wrapped_keyring, str) and wrapped_keyring:
        try:
            system = platform.system()
            keyring_kek = None
            if system == "Windows":
                keyring_kek = _machine_key_windows(
                    create_if_missing=False, data_dir=data_dir
                )
            elif system == "Darwin":
                keyring_kek = _machine_key_macos_keyring(create_if_missing=False)
            elif system == "Linux" and os.environ.get("DBUS_SESSION_BUS_ADDRESS"):
                keyring_kek = _machine_key_linux_keyring(create_if_missing=False)
            if keyring_kek:
                dek = _unwrap_key(keyring_kek, wrapped_keyring)
                if len(dek) == KEY_SIZE and _key_id(dek) == expected_key_id:
                    return dek
        except Exception as exc:
            logger.debug("Primary keyring unwrap bypassed: %s", exc)

    # Fallback to local File Vault (.machine_key)
    wrapped_file = envelope.get("wrapped_file")
    if isinstance(wrapped_file, str) and wrapped_file:
        try:
            file_kek = _machine_key_file(create_if_missing=False, data_dir=data_dir)
            dek = _unwrap_key(file_kek, wrapped_file)
            if len(dek) == KEY_SIZE and _key_id(dek) == expected_key_id:
                return dek
        except Exception as exc:
            logger.debug("File vault unwrap bypassed: %s", exc)

    # Emergency fallback via Master Recovery Key
    wrapped_recovery = envelope.get("wrapped_recovery")
    recovery_salt_hex = envelope.get("recovery_salt")
    if isinstance(wrapped_recovery, str) and isinstance(recovery_salt_hex, str):
        rec_candidate = os.getenv("FACENOX_RECOVERY_KEY")
        if not rec_candidate:
            rec_file = data_dir / "RECOVERY_KEY.txt"
            if rec_file.exists():
                for line in rec_file.read_text(encoding="utf-8").splitlines():
                    if "Recovery Key:" in line:
                        rec_candidate = line.split(":", 1)[1].strip()
                        break
        if rec_candidate:
            try:
                rec_salt = bytes.fromhex(recovery_salt_hex)
                rec_kek = _derive_recovery_kek(rec_candidate, rec_salt)
                dek = _unwrap_key(rec_kek, wrapped_recovery)
                if len(dek) == KEY_SIZE and _key_id(dek) == expected_key_id:
                    _reestablish_envelope_keystores(data_dir, dek, envelope, metadata)
                    return dek
            except Exception as exc:
                logger.warning("Recovery key attempt failed: %s", exc)

    raise MachineKeyUnavailableError(
        "Biometric encryption key could not be unlocked from OS Keyring or File Vault. "
        "Provide your Master Recovery Key via FACENOX_RECOVERY_KEY or save RECOVERY_KEY.txt in the data directory."
    )


def _load_exact_provider(
    provider: str, data_dir: Path, *, create_if_missing: bool
) -> bytes:
    if provider == "envelope":
        metadata = _read_provider(data_dir)
        if metadata is None:
            raise MachineKeyUnavailableError("Envelope metadata is missing.")
        return _load_envelope_key(data_dir, metadata)
    if provider == "environment":
        key = _decode_environment_key()
        if key is None:
            raise MachineKeyUnavailableError(
                "The database is pinned to FACENOX_MACHINE_KEY, but it is not set."
            )
        return key
    if provider == "windows-dpapi":
        if platform.system() != "Windows":
            raise MachineKeyUnavailableError(
                "This database is pinned to Windows DPAPI on a different platform."
            )
        return _machine_key_windows(
            create_if_missing=create_if_missing, data_dir=data_dir
        )
    if provider == "macos-keychain":
        if platform.system() != "Darwin":
            raise MachineKeyUnavailableError(
                "This database is pinned to macOS Keychain on a different platform."
            )
        return _machine_key_macos_keyring(create_if_missing=create_if_missing)
    if provider == "linux-keyring":
        if platform.system() != "Linux":
            raise MachineKeyUnavailableError(
                "This database is pinned to Linux Secret Service on a different platform."
            )
        try:
            return _machine_key_linux_keyring(create_if_missing=create_if_missing)
        except MachineKeyUnavailableError:
            file_key = data_dir / ".machine_key"
            if file_key.exists():
                return _machine_key_file(create_if_missing=False, data_dir=data_dir)
            raise
    if provider == "file":
        return _machine_key_file(create_if_missing=create_if_missing, data_dir=data_dir)
    raise MachineKeyUnavailableError(f"Unsupported machine-key provider: {provider}")


def _create_envelope(data_dir: Path, *, create_if_missing: bool) -> tuple[str, bytes]:
    if not create_if_missing:
        raise MachineKeyUnavailableError("No existing machine-key envelope found.")

    dek = os.urandom(KEY_SIZE)

    recovery_key = _generate_recovery_key()
    recovery_salt = os.urandom(16)
    recovery_kek = _derive_recovery_kek(recovery_key, recovery_salt)
    wrapped_recovery = _wrap_key(recovery_kek, dek)

    rec_txt = (
        "Facenox Master Recovery Key\n"
        f"Recovery Key: {recovery_key}\n\n"
        "Store this key securely. It allows restoring access if your system keyring is reset or migrated.\n"
    )
    _write_secure_file(data_dir / "RECOVERY_KEY.txt", rec_txt.encode("utf-8"))

    file_kek = _machine_key_file(create_if_missing=True, data_dir=data_dir)
    wrapped_file = _wrap_key(file_kek, dek)

    wrapped_keyring = None
    try:
        system = platform.system()
        if system == "Windows":
            keyring_kek = _machine_key_windows(
                create_if_missing=True, data_dir=data_dir
            )
            wrapped_keyring = _wrap_key(keyring_kek, dek)
        elif system == "Darwin":
            keyring_kek = _machine_key_macos_keyring(create_if_missing=True)
            wrapped_keyring = _wrap_key(keyring_kek, dek)
        elif system == "Linux" and os.environ.get("DBUS_SESSION_BUS_ADDRESS"):
            try:
                keyring_kek = _machine_key_linux_keyring(create_if_missing=True)
                wrapped_keyring = _wrap_key(keyring_kek, dek)
            except Exception:
                pass
    except Exception as exc:
        logger.warning(
            "OS Keyring registration skipped during envelope creation: %s", exc
        )

    envelope = {
        "wrapped_file": wrapped_file,
        "wrapped_keyring": wrapped_keyring,
        "wrapped_recovery": wrapped_recovery,
        "recovery_salt": recovery_salt.hex(),
        "recovery_preview": f"FNX-****-****-{recovery_key.split('-')[-1]}",
    }
    _pin_provider(data_dir, "envelope", dek, envelope=envelope)
    return "envelope", dek


def _discover_provider(data_dir: Path, *, create_if_missing: bool) -> tuple[str, bytes]:
    environment_key = _decode_environment_key()
    if environment_key is not None:
        return "environment", environment_key

    # Check for legacy .machine_key file without .machine_key.json
    file_key = data_dir / ".machine_key"
    if not create_if_missing and file_key.exists():
        return "file", _machine_key_file(create_if_missing=False, data_dir=data_dir)

    # Use Dual Envelope Architecture (Rank 1)
    return _create_envelope(data_dir, create_if_missing=create_if_missing)


def get_machine_key_record(
    *, create_if_missing: bool = True, data_dir: Path | None = None
) -> MachineKeyRecord:
    """Load the pinned machine key for a data directory."""

    global _CACHED_MACHINE_KEY, _CACHED_MACHINE_PROVIDER, _CACHED_MACHINE_DATA_DIR
    active_data_dir = (data_dir or DATA_DIR).resolve()
    if (
        _CACHED_MACHINE_KEY is not None
        and _CACHED_MACHINE_PROVIDER is not None
        and _CACHED_MACHINE_DATA_DIR == active_data_dir
    ):
        return MachineKeyRecord(
            _CACHED_MACHINE_KEY,
            _CACHED_MACHINE_PROVIDER,
            _key_id(_CACHED_MACHINE_KEY),
        )

    metadata = _read_provider(active_data_dir)
    if metadata is not None:
        provider = metadata.get("provider")
        if not isinstance(provider, str):
            raise MachineKeyUnavailableError("Machine-key provider is missing.")
        key = _load_exact_provider(provider, active_data_dir, create_if_missing=False)
        record = _validate_record(active_data_dir, provider, key, metadata)
    else:
        provider, key = _discover_provider(
            active_data_dir, create_if_missing=create_if_missing
        )
        if len(key) != KEY_SIZE:
            raise MachineKeyUnavailableError(
                f"Machine key from provider '{provider}' has an invalid length."
            )
        if provider == "environment":
            _pin_provider(active_data_dir, provider, key)
        record = MachineKeyRecord(key, provider, _key_id(key))

    _CACHED_MACHINE_KEY = record.key
    _CACHED_MACHINE_PROVIDER = record.provider
    _CACHED_MACHINE_DATA_DIR = active_data_dir
    return record


def get_machine_key(
    *, create_if_missing: bool = True, data_dir: Path | None = None
) -> bytes:
    return get_machine_key_record(
        create_if_missing=create_if_missing, data_dir=data_dir
    ).key


# ---------------------------------------------------------------------------
# Platform-specific implementations
# ---------------------------------------------------------------------------


def _machine_key_windows(
    *, create_if_missing: bool = True, data_dir: Path | None = None
) -> bytes:
    """DPAPI-protected key: only decryptable on the same Windows user account."""
    import ctypes
    import ctypes.wintypes

    class DATA_BLOB(ctypes.Structure):
        _fields_ = [
            ("cbData", ctypes.wintypes.DWORD),
            ("pbData", ctypes.POINTER(ctypes.c_byte)),
        ]

    active_data_dir = (data_dir or DATA_DIR).resolve()
    key_path = active_data_dir / ".machine_key.dpapi"
    crypt32 = ctypes.windll.crypt32

    if key_path.exists():
        with open(key_path, "rb") as f:
            encrypted = f.read()
        enc_array = (ctypes.c_byte * len(encrypted)).from_buffer_copy(encrypted)
        enc_blob = DATA_BLOB(len(encrypted), enc_array)
        dec_blob = DATA_BLOB()
        if not crypt32.CryptUnprotectData(
            ctypes.byref(enc_blob), None, None, None, None, 0, ctypes.byref(dec_blob)
        ):
            raise RuntimeError(
                "DPAPI: failed to decrypt machine key - wrong user or corrupted file."
            )
        key = bytes(ctypes.string_at(dec_blob.pbData, dec_blob.cbData))
        ctypes.windll.kernel32.LocalFree(dec_blob.pbData)
        if len(key) != KEY_SIZE:
            raise MachineKeyUnavailableError("DPAPI machine key has an invalid length.")
        return key

    if not create_if_missing:
        raise MachineKeyUnavailableError(
            f"Biometric machine key is missing: {key_path}"
        )

    raw_key = os.urandom(KEY_SIZE)
    raw_array = (ctypes.c_byte * KEY_SIZE).from_buffer_copy(raw_key)
    raw_blob = DATA_BLOB(KEY_SIZE, raw_array)
    enc_blob = DATA_BLOB()
    if not crypt32.CryptProtectData(
        ctypes.byref(raw_blob), None, None, None, None, 0, ctypes.byref(enc_blob)
    ):
        raise RuntimeError("DPAPI: failed to encrypt machine key.")
    encrypted = bytes(ctypes.string_at(enc_blob.pbData, enc_blob.cbData))
    ctypes.windll.kernel32.LocalFree(enc_blob.pbData)

    _write_secure_file(key_path, encrypted)
    try:
        ctypes.windll.kernel32.SetFileAttributesW(str(key_path), 0x02)  # HIDDEN
    except Exception:
        pass
    return raw_key


def _machine_key_macos_keyring(*, create_if_missing: bool = True) -> bytes:
    try:
        import keyring

        service = "facenox-biometric-key"
        account = "machine-key"

        password = keyring.get_password(service, account)
        if password is not None:
            key = base64.b64decode(password.strip(), validate=True)
            if len(key) != KEY_SIZE:
                raise MachineKeyUnavailableError(
                    "macOS Keychain machine key has an invalid length."
                )
            return key

        if not create_if_missing:
            raise MachineKeyUnavailableError(
                "Biometric machine key is missing from macOS Keychain."
            )

        raw_key = os.urandom(KEY_SIZE)
        encoded = base64.b64encode(raw_key).decode()
        keyring.set_password(service, account, encoded)
        return raw_key
    except MachineKeyUnavailableError:
        raise
    except Exception as exc:
        raise MachineKeyUnavailableError(
            f"macOS Keychain is unavailable: {exc}"
        ) from exc


def _machine_key_macos(*, create_if_missing: bool = True) -> bytes:
    try:
        return _machine_key_macos_keyring(create_if_missing=create_if_missing)
    except MachineKeyUnavailableError as exc:
        logger.warning(
            "macOS Keychain unavailable; using pinned file provider: %s", exc
        )
        return _machine_key_file(create_if_missing=create_if_missing)


def _machine_key_linux_keyring(*, create_if_missing: bool = True) -> bytes:
    try:
        import keyring

        service = "facenox-biometric-key"
        account = "machine-key"

        # Fail early to fallback to file storage if keyring is not available
        from keyring.backends.fail import Keyring as FailKeyring

        backend = keyring.get_keyring()
        if isinstance(backend, FailKeyring):
            raise RuntimeError("No native keyring available.")

        password = keyring.get_password(service, account)
        if password is not None:
            key = base64.b64decode(password.strip(), validate=True)
            if len(key) != KEY_SIZE:
                raise MachineKeyUnavailableError(
                    "Linux keyring machine key has an invalid length."
                )
            return key

        if not create_if_missing:
            raise MachineKeyUnavailableError(
                "Biometric machine key is missing from Linux Secret Service."
            )

        raw_key = os.urandom(KEY_SIZE)
        encoded = base64.b64encode(raw_key).decode()
        keyring.set_password(service, account, encoded)
        return raw_key
    except MachineKeyUnavailableError:
        raise
    except Exception as exc:
        raise MachineKeyUnavailableError(
            f"Linux Secret Service is unavailable: {exc}"
        ) from exc


def _machine_key_linux(*, create_if_missing: bool = True) -> bytes:
    if not os.environ.get("DBUS_SESSION_BUS_ADDRESS"):
        return _machine_key_file(create_if_missing=create_if_missing)
    try:
        return _machine_key_linux_keyring(create_if_missing=create_if_missing)
    except MachineKeyUnavailableError as exc:
        logger.warning("Linux keyring unavailable; using pinned file provider: %s", exc)
        return _machine_key_file(create_if_missing=create_if_missing)


def _machine_key_file(
    *, create_if_missing: bool = True, data_dir: Path | None = None
) -> bytes:
    """File-based fallback for Linux. Permissions set to 0600."""
    active_data_dir = (data_dir or DATA_DIR).resolve()
    key_path = active_data_dir / ".machine_key"
    if key_path.exists():
        with open(key_path, "rb") as f:
            key = f.read()
        if len(key) != KEY_SIZE:
            raise MachineKeyUnavailableError(
                f"File-based machine key has an invalid length: {key_path}"
            )
        return key
    if not create_if_missing:
        raise MachineKeyUnavailableError(
            f"Biometric machine key is missing: {key_path}"
        )
    key = os.urandom(KEY_SIZE)
    _write_secure_file(key_path, key)
    logger.warning(
        "Machine key stored as a file (%s). On Linux there is no OS-managed secure store. "
        "Ensure the filesystem permissions and full-disk encryption protect this file.",
        key_path,
    )
    return key


def encrypt_local_data(plaintext: bytes) -> bytes:
    """Encrypt data for local SQLite database storage using a machine ring key."""
    key = get_machine_key()
    iv = os.urandom(IV_SIZE)
    encrypted = AESGCM(key).encrypt(iv, plaintext, None)
    return iv + encrypted


class DecryptionError(Exception):
    """Raised when local data decryption fails."""


class MachineKeyUnavailableError(RuntimeError):
    """Raised when encrypted local data exists but its machine key is unavailable."""


def decrypt_local_data(
    blob: bytes,
    *,
    create_key_if_missing: bool = True,
    key: bytes | None = None,
    data_dir: Path | None = None,
) -> bytes:
    """Decrypt data from local SQLite database storage."""
    active_key = key or get_machine_key(
        create_if_missing=create_key_if_missing, data_dir=data_dir
    )
    if len(blob) < IV_SIZE:
        raise DecryptionError("Blob too short to be encrypted data")

    iv = blob[:IV_SIZE]
    ciphertext = blob[IV_SIZE:]
    try:
        return AESGCM(active_key).decrypt(iv, ciphertext, None)
    except Exception as e:
        logger.error(f"decrypt_local_data: decryption failed: {e}")
        raise DecryptionError("Failed to decrypt local data") from e

"""
AES-256-GCM encryption for .facenox backup files.

Blob layout: MAGIC(6) | SALT(16) | IV(12) | TAG(16) | CIPHERTEXT
Key derivation: PBKDF2-HMAC-SHA256, 480k iterations.

Machine key storage (encrypt_local_data / decrypt_local_data):
  Windows : DPAPI (CryptProtectData) tied to the Windows user login.
  macOS   : macOS Keychain via the `security` CLI.
  Linux   : File-based fallback with 0600 permissions.
"""

import os
import logging
import platform
import hashlib
import hmac

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


def get_machine_key() -> bytes:
    """Get or create the machine-specific AES key for local database encryption.

    Delegates to the OS-appropriate secure store:
      Windows  -> DPAPI (CryptProtectData/CryptUnprotectData)
      macOS    -> macOS Keychain via the `security` CLI
      Linux    -> 0600-mode file fallback
    """
    system = platform.system()
    if system == "Windows":
        return _machine_key_windows()
    elif system == "Darwin":
        return _machine_key_macos()
    else:
        return _machine_key_file()


# ---------------------------------------------------------------------------
# Platform-specific implementations
# ---------------------------------------------------------------------------


def _machine_key_windows() -> bytes:
    """DPAPI-protected key: only decryptable on the same Windows user account."""
    import ctypes
    import ctypes.wintypes

    class DATA_BLOB(ctypes.Structure):
        _fields_ = [
            ("cbData", ctypes.wintypes.DWORD),
            ("pbData", ctypes.POINTER(ctypes.c_byte)),
        ]

    key_path = DATA_DIR / ".machine_key.dpapi"
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
        return key

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

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(key_path, "wb") as f:
        f.write(encrypted)
    try:
        ctypes.windll.kernel32.SetFileAttributesW(str(key_path), 0x02)  # HIDDEN
    except Exception:
        pass
    return raw_key


def _machine_key_macos() -> bytes:
    """Keychain-stored key via the macOS `security` CLI."""
    import subprocess
    import base64

    service = "facenox-biometric-key"
    account = "machine-key"

    result = subprocess.run(
        ["security", "find-generic-password", "-s", service, "-a", account, "-w"],
        capture_output=True,
        text=True,
    )
    if result.returncode == 0:
        return base64.b64decode(result.stdout.strip())

    raw_key = os.urandom(KEY_SIZE)
    encoded = base64.b64encode(raw_key).decode()
    subprocess.run(
        [
            "security",
            "add-generic-password",
            "-s",
            service,
            "-a",
            account,
            "-w",
            encoded,
        ],
        check=True,
        capture_output=True,
    )
    return raw_key


def _machine_key_file() -> bytes:
    """File-based fallback for Linux. Permissions set to 0600."""
    key_path = DATA_DIR / ".machine_key"
    if key_path.exists():
        with open(key_path, "rb") as f:
            return f.read()
    key = os.urandom(KEY_SIZE)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(key_path, "wb") as f:
        f.write(key)
    try:
        os.chmod(str(key_path), 0o600)
    except Exception:
        pass
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


def decrypt_local_data(blob: bytes) -> bytes:
    """Decrypt data from local SQLite database storage."""
    key = get_machine_key()
    if len(blob) < IV_SIZE:
        return blob  # Too short to be encrypted with our scheme

    iv = blob[:IV_SIZE]
    ciphertext = blob[IV_SIZE:]
    try:
        return AESGCM(key).decrypt(iv, ciphertext, None)
    except Exception:
        # Fallback for backwards compatibility with unencrypted legacy databases.
        # Log clearly so operators are aware unencrypted data is present.
        logger.warning(
            "decrypt_local_data: decryption failed - returning raw blob. "
            "This is expected only during first-run migration of legacy unencrypted data. "
            "If this message persists, the local database may be corrupted or tampered."
        )
        return blob

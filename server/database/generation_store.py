"""Authenticated storage for crash-recoverable database generations."""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import shutil
import sys
import time
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator

GENERATIONS_DIRECTORY = "generations"
CURRENT_POINTER_FILENAME = "CURRENT.json"
GENERATION_MANIFEST_FILENAME = "manifest.json"
GENERATION_HEALTH_FILENAME = "HEALTHY.json"
MIGRATION_LOCK_FILENAME = ".migration.lock"
GENERATION_DATABASE_FILENAME = "attendance.db"
POINTER_FORMAT = 1
MANIFEST_FORMAT = 1
GENERATION_RETENTION = 3


class GenerationStoreError(RuntimeError):
    pass


@dataclass(frozen=True)
class GenerationPointer:
    generation: str
    previous_generation: str | None
    sequence: int
    activation: str


def _canonical_json(value: dict[str, object]) -> bytes:
    return json.dumps(
        value, sort_keys=True, separators=(",", ":"), ensure_ascii=True
    ).encode("utf-8")


def _authenticated(value: dict[str, object], key: bytes) -> dict[str, object]:
    signed = dict(value)
    signed["hmac_sha256"] = hmac.new(
        key, _canonical_json(value), hashlib.sha256
    ).hexdigest()
    return signed


def _verify_authenticated(
    value: object, key: bytes, *, description: str
) -> dict[str, object]:
    if not isinstance(value, dict):
        raise GenerationStoreError(f"{description} is not a JSON object.")
    received = value.get("hmac_sha256")
    unsigned = {
        key_name: item for key_name, item in value.items() if key_name != "hmac_sha256"
    }
    expected = hmac.new(key, _canonical_json(unsigned), hashlib.sha256).hexdigest()
    if not isinstance(received, str) or not hmac.compare_digest(received, expected):
        raise GenerationStoreError(f"{description} authentication failed.")
    return unsigned


def _secure_directory(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)
    if os.name != "nt":
        path.chmod(0o700)


def secure_file(path: Path) -> None:
    if os.name != "nt" and path.exists():
        path.chmod(0o600)


def fsync_file(path: Path) -> None:
    with path.open("r+b") as stream:
        os.fsync(stream.fileno())


def fsync_directory(path: Path) -> None:
    if sys.platform == "win32":
        return
    try:
        descriptor = os.open(path, os.O_RDONLY)
    except OSError:
        return
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def write_authenticated_json(path: Path, value: dict[str, object], key: bytes) -> None:
    _secure_directory(path.parent)
    temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    payload = _authenticated(value, key)
    try:
        with temporary.open("x", encoding="utf-8", newline="\n") as stream:
            json.dump(payload, stream, indent=2, sort_keys=True)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        secure_file(temporary)
        os.replace(temporary, path)
        secure_file(path)
        fsync_directory(path.parent)
    finally:
        temporary.unlink(missing_ok=True)


def read_authenticated_json(
    path: Path, key: bytes, *, description: str
) -> dict[str, object]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise GenerationStoreError(f"{description} is unreadable: {path}") from exc
    return _verify_authenticated(value, key, description=description)


def generations_root(data_dir: Path) -> Path:
    return data_dir / GENERATIONS_DIRECTORY


def pointer_path(data_dir: Path) -> Path:
    return data_dir / CURRENT_POINTER_FILENAME


def validate_generation_name(name: str) -> str:
    if (
        not name.startswith("gen-")
        or Path(name).name != name
        or "/" in name
        or "\\" in name
    ):
        raise GenerationStoreError(f"Unsafe generation name: {name!r}")
    return name


def generation_directory(data_dir: Path, name: str) -> Path:
    validate_generation_name(name)
    root = generations_root(data_dir).resolve()
    selected = (root / name).resolve()
    if root not in selected.parents:
        raise GenerationStoreError(f"Generation escapes its root: {name!r}")
    return selected


def generation_database(data_dir: Path, name: str) -> Path:
    return generation_directory(data_dir, name) / GENERATION_DATABASE_FILENAME


def read_pointer(data_dir: Path, key: bytes) -> GenerationPointer | None:
    path = pointer_path(data_dir)
    if not path.exists():
        return None
    value = read_authenticated_json(path, key, description="Generation pointer")
    if value.get("format") != POINTER_FORMAT:
        raise GenerationStoreError(f"Unsupported generation pointer: {path}")
    generation = value.get("generation")
    previous = value.get("previous_generation")
    sequence = value.get("sequence")
    activation = value.get("activation")
    if (
        not isinstance(generation, str)
        or (previous is not None and not isinstance(previous, str))
        or not isinstance(sequence, int)
        or activation not in {"pending", "healthy"}
    ):
        raise GenerationStoreError(f"Invalid generation pointer: {path}")
    validate_generation_name(generation)
    if previous is not None:
        validate_generation_name(previous)
    return GenerationPointer(generation, previous, sequence, str(activation))


def write_pointer(data_dir: Path, pointer: GenerationPointer, key: bytes) -> None:
    write_authenticated_json(
        pointer_path(data_dir),
        {
            "format": POINTER_FORMAT,
            "generation": pointer.generation,
            "previous_generation": pointer.previous_generation,
            "sequence": pointer.sequence,
            "activation": pointer.activation,
            "updated_at_unix": time.time(),
        },
        key,
    )


def new_generation_name(sequence: int) -> str:
    timestamp = time.strftime("%Y%m%d-%H%M%S", time.gmtime())
    return f"gen-{sequence:08d}-{timestamp}-{uuid.uuid4().hex[:8]}"


def create_pending_generation(data_dir: Path) -> Path:
    root = generations_root(data_dir)
    _secure_directory(root)
    pending = root / f".pending-{uuid.uuid4().hex}"
    _secure_directory(pending)
    return pending


def publish_generation(pending: Path, data_dir: Path, generation: str) -> Path:
    destination = generation_directory(data_dir, generation)
    if destination.exists():
        raise GenerationStoreError(f"Generation already exists: {destination}")
    os.replace(pending, destination)
    fsync_directory(destination.parent)
    return destination


def remove_generation_tree(path: Path, data_dir: Path) -> None:
    if not path.exists():
        return
    root = generations_root(data_dir).resolve()
    resolved = path.resolve()
    if resolved == root or root not in resolved.parents:
        raise GenerationStoreError(f"Refusing to remove unsafe path: {resolved}")
    shutil.rmtree(resolved)
    fsync_directory(root)


def cleanup_pending_generations(data_dir: Path) -> None:
    root = generations_root(data_dir)
    if not root.exists():
        return
    for path in root.iterdir():
        if path.is_dir() and path.name.startswith(".pending-"):
            remove_generation_tree(path, data_dir)


def has_published_generations(data_dir: Path) -> bool:
    root = generations_root(data_dir)
    return root.exists() and any(
        path.is_dir() and path.name.startswith("gen-") for path in root.iterdir()
    )


def write_generation_manifest(
    generation_dir: Path, value: dict[str, object], key: bytes
) -> None:
    write_authenticated_json(
        generation_dir / GENERATION_MANIFEST_FILENAME,
        {"format": MANIFEST_FORMAT, **value},
        key,
    )


def read_generation_manifest(
    data_dir: Path, generation: str, key: bytes
) -> dict[str, object]:
    path = generation_directory(data_dir, generation) / GENERATION_MANIFEST_FILENAME
    value = read_authenticated_json(path, key, description="Generation manifest")
    if value.get("format") != MANIFEST_FORMAT or value.get("generation") != generation:
        raise GenerationStoreError(f"Invalid generation manifest: {path}")
    return value


def write_health_marker(
    data_dir: Path, generation: str, sequence: int, key: bytes
) -> None:
    directory = generation_directory(data_dir, generation)
    write_authenticated_json(
        directory / GENERATION_HEALTH_FILENAME,
        {
            "format": 1,
            "generation": generation,
            "sequence": sequence,
            "healthy_at_unix": time.time(),
        },
        key,
    )


def has_health_marker(data_dir: Path, generation: str, key: bytes) -> bool:
    path = generation_directory(data_dir, generation) / GENERATION_HEALTH_FILENAME
    if not path.exists():
        return False
    value = read_authenticated_json(path, key, description="Generation health marker")
    return (
        value.get("format") == 1
        and value.get("generation") == generation
        and isinstance(value.get("sequence"), int)
    )


def healthy_generation_candidates(data_dir: Path, key: bytes) -> list[tuple[int, str]]:
    candidates: list[tuple[int, str]] = []
    for sequence, generation in published_generation_candidates(data_dir, key):
        try:
            if has_health_marker(data_dir, generation, key):
                candidates.append((sequence, generation))
        except GenerationStoreError:
            continue
    return candidates


def published_generation_candidates(
    data_dir: Path, key: bytes
) -> list[tuple[int, str]]:
    root = generations_root(data_dir)
    if not root.exists():
        return []
    candidates: list[tuple[int, str]] = []
    for path in root.iterdir():
        if not path.is_dir() or not path.name.startswith("gen-"):
            continue
        try:
            manifest = read_generation_manifest(data_dir, path.name, key)
            sequence = manifest.get("sequence")
            if isinstance(sequence, int):
                candidates.append((sequence, path.name))
        except GenerationStoreError:
            continue
    return sorted(candidates, reverse=True)


def prune_generations(data_dir: Path, pointer: GenerationPointer) -> None:
    root = generations_root(data_dir)
    if not root.exists():
        return
    protected = {pointer.generation}
    if pointer.previous_generation:
        protected.add(pointer.previous_generation)
    generations = sorted(
        (
            path
            for path in root.iterdir()
            if path.is_dir() and path.name.startswith("gen-")
        ),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    retained = set(protected)
    retained.update(path.name for path in generations[:GENERATION_RETENTION])
    for path in generations:
        if path.name not in retained:
            remove_generation_tree(path, data_dir)


@contextmanager
def migration_lock(data_dir: Path, timeout: float = 30.0) -> Iterator[None]:
    """Hold an OS-released lock across generation selection and publication."""

    _secure_directory(data_dir)
    lock_path = data_dir / MIGRATION_LOCK_FILENAME
    stream = lock_path.open("a+b")
    secure_file(lock_path)
    stream.seek(0, os.SEEK_END)
    if stream.tell() == 0:
        stream.write(b"0")
        stream.flush()
    deadline = time.monotonic() + timeout
    acquired = False
    try:
        while not acquired:
            try:
                stream.seek(0)
                if os.name == "nt":
                    import msvcrt

                    msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
                else:
                    import fcntl

                    fcntl.flock(stream.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                acquired = True
            except OSError as exc:
                if time.monotonic() >= deadline:
                    raise GenerationStoreError(
                        "Another FaceNox process is using the migration lock."
                    ) from exc
                time.sleep(0.1)
        yield
    finally:
        if acquired:
            stream.seek(0)
            if os.name == "nt":
                import msvcrt

                msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                import fcntl

                fcntl.flock(stream.fileno(), fcntl.LOCK_UN)
        stream.close()

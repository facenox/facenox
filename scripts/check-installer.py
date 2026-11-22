#!/usr/bin/env python3
"""Exercise the packaged backend with disposable fresh and upgrade profiles."""

import argparse
from contextlib import contextmanager
import json
import os
from pathlib import Path
import secrets
import shutil
import signal
import socket
import subprocess
import sys
from tempfile import TemporaryDirectory
import time
from urllib.error import URLError
from urllib.request import Request, urlopen


def install(installer: Path, destination: Path) -> Path:
    destination.mkdir(exist_ok=True)
    if sys.platform == "win32":
        # NSIS requires /D to be the last parameter, without quotes.
        subprocess.run(f'"{installer}" /S /D={destination}', check=True, timeout=180)
        return destination / "resources" / "server" / "server.exe"
    if installer.suffix == ".dmg":
        mount = destination.parent / "mount"
        mount.mkdir(exist_ok=True)
        subprocess.run(
            [
                "hdiutil",
                "attach",
                "-readonly",
                "-nobrowse",
                "-mountpoint",
                mount,
                installer,
            ],
            check=True,
            timeout=120,
        )
        try:
            (source,) = mount.glob("*.app")
            target = destination / source.name
            if target.exists():
                shutil.rmtree(target)
            subprocess.run(["ditto", source, target], check=True, timeout=120)
        finally:
            subprocess.run(["hdiutil", "detach", mount], check=True, timeout=60)
        return target / "Contents" / "Resources" / "server" / "server"
    if installer.suffix == ".AppImage":
        unpacked = destination / "squashfs-root"
        if unpacked.exists():
            shutil.rmtree(unpacked)
        subprocess.run(
            [installer, "--appimage-extract"],
            cwd=destination,
            check=True,
            stdout=subprocess.DEVNULL,
            timeout=120,
        )
        return unpacked / "resources" / "server" / "server"
    if installer.suffix == ".deb":
        subprocess.run(
            ["dpkg-deb", "-x", installer, destination], check=True, timeout=120
        )
        (executable,) = destination.glob("opt/*/resources/server/server")
        return executable
    raise ValueError(f"Unsupported installer: {installer}")


@contextmanager
def backend(executable: Path, data: Path):
    if not executable.is_file():
        raise FileNotFoundError(executable)
    data.mkdir(exist_ok=True)
    with socket.socket() as port_socket:
        port_socket.bind(("127.0.0.1", 0))
        port = port_socket.getsockname()[1]

    token = secrets.token_urlsafe(32)
    environment = dict(
        os.environ,
        FACENOX_DATA_DIR=str(data),
        FACENOX_LOG_DIR=str(data),
        FACENOX_API_TOKEN=token,
    )
    environment.pop("FACENOX_ACTIVE_DB_PATH", None)
    environment.pop("FACENOX_LEGACY_DATA_DIR", None)
    log = data / "startup.log"

    def request(route, payload=None):
        headers = {"X-Facenox-Token": token}
        body = None
        if payload is not None:
            headers["Content-Type"] = "application/json"
            body = json.dumps(payload).encode()
        with urlopen(
            Request(f"http://127.0.0.1:{port}{route}", body, headers), timeout=5
        ) as resp:
            return json.load(resp)

    with log.open("w") as output:
        process = subprocess.Popen(
            [executable, "--port", str(port)],
            cwd=executable.parent,
            env=environment,
            stdout=output,
            stderr=subprocess.STDOUT,
            start_new_session=sys.platform != "win32",
        )
        try:
            deadline = time.monotonic() + 60
            while True:
                exit_code = process.poll()
                if exit_code is not None or time.monotonic() >= deadline:
                    reason = (
                        "timed out" if exit_code is None else f"exited with {exit_code}"
                    )
                    raise RuntimeError(
                        f"{executable} {reason} for {data.name}:\n"
                        f"{log.read_text(errors='replace')[-6000:]}"
                    )
                try:
                    models = request("/models")["models"]
                    break
                except URLError:
                    time.sleep(0.2)
            for name in ("face_detector", "face_recognizer", "liveness_detector"):
                if not models[name]["available"]:
                    raise RuntimeError(f"The packaged {name} did not load")
            yield request
        finally:
            if sys.platform == "win32":
                subprocess.run(
                    ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    timeout=20,
                )
            else:
                try:
                    os.killpg(process.pid, signal.SIGTERM)
                except ProcessLookupError:
                    pass
            process.wait(timeout=20)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("previous", type=Path)
    parser.add_argument("candidate", type=Path)
    args = parser.parse_args()
    with TemporaryDirectory(prefix="facenox-installer-") as temp:
        root = Path(temp)
        installed = root / "installed"
        previous = install(args.previous.resolve(strict=True), installed)
        with backend(previous, root / "upgrade-data") as request:
            group = request("/attendance/groups", {"name": "Installer upgrade"})
            member = request(
                "/attendance/members", {"name": "Test member", "group_id": group["id"]}
            )
            punch = request(
                "/attendance/records",
                {
                    "person_id": member["person_id"],
                    "event_type": "check_in",
                    "is_manual": True,
                },
            )

        candidate = install(args.candidate.resolve(strict=True), installed)
        if not candidate.with_name("_internal").is_dir():
            raise RuntimeError(f"Installed backend is missing _internal: {candidate}")

        with backend(candidate, root / "fresh-data") as request:
            if request("/attendance/records") != []:
                raise RuntimeError("Fresh profile contains attendance records")
        print(
            "PASS installed backend initialized a fresh profile and loaded its models",
            flush=True,
        )

        with backend(candidate, root / "upgrade-data") as request:
            records = request("/attendance/records")
            if [record["id"] for record in records] != [punch["id"]]:
                raise RuntimeError(
                    "The installed backend did not preserve the previous check-in"
                )
        print(
            "PASS upgraded backend opened existing attendance and loaded its models",
            flush=True,
        )


if __name__ == "__main__":
    main()

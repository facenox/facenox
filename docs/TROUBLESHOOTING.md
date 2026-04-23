# Troubleshooting

This page covers the problems you are most likely to hit while running Facenox from source.

## The desktop app opens but the backend never becomes ready

Check the Python environment first.

- Confirm that `server/venv` exists.
- Confirm that the virtual environment contains the packages from `server/requirements.txt`.
- If needed, recreate the environment:

```bash
cd server
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

If you also need formatting/linting tools or backend packaging tools, install:

```bash
pip install -r requirements-dev.txt
pip install -r requirements-build.txt
```

The Electron app looks for a Python interpreter in the server virtual environment before falling back to system Python.

## Port `8700` is already in use

Facenox's local backend uses port `8700` by default. Another Facenox instance or an orphaned Python process can block startup.

### Windows

```bash
netstat -ano | findstr :8700
taskkill /PID <PID> /F
```

### macOS or Linux

```bash
lsof -i :8700
kill -9 <PID>
```

## `ImportError` or DLL errors on Windows

This usually means a missing runtime dependency or a broken Python environment.

Try the following:

1. Recreate the virtual environment.
2. Reinstall backend runtime dependencies from `server/requirements.txt`.
3. Install the current Microsoft Visual C++ Redistributable if the error points to missing DLL support.

Official Microsoft download page:
https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist

## `ImportError: libgthread-2.0.so.0` on Linux

This means the Python `opencv-python` package imported successfully enough to load its native extension, but your OS is missing the GLib thread runtime that OpenCV expects.

Install the system package that provides `libgthread-2.0.so.0`, then restart the app.

Examples:

```bash
# openSUSE Tumbleweed
sudo zypper install libgthread-2_0-0

# Debian / Ubuntu
sudo apt install libglib2.0-0

# Fedora
sudo dnf install glib2
```

After installing the package, verify the backend dependency directly:

```bash
cd server
source venv/bin/activate
python -c "import cv2; print(cv2.__version__)"
```

## Camera access fails

Check these basics first:

- another app is not already holding the camera
- OS camera permissions allow Facenox to use the device
- the selected camera in Facenox still exists

If the wrong device is selected, switch cameras in the desktop settings and retry.

## Camera preview is green or looks like static on Linux

If the preview is bright green, striped, or looks like random sensor noise, the camera is usually opening with the wrong pixel format rather than failing completely.

This is common on Linux laptops that expose several `/dev/video*` nodes for one physical webcam. Some nodes are:

- the normal RGB camera feed
- IR or depth-related feeds
- metadata or motion-raw nodes that should not be used as a normal webcam

Facenox currently relies on Electron/Chromium camera selection, so it can only show the logical camera devices that the browser stack exposes. That is why you may only see one or two options in the app even when Linux shows more `/dev/video*` entries.

### openSUSE Tumbleweed checks

Install the basic V4L inspection tools:

```bash
sudo zypper install v4l-utils ffmpeg
```

List the camera groups and their backing device nodes:

```bash
v4l2-ctl --list-devices
```

Then inspect the formats for each candidate node:

```bash
v4l2-ctl -d /dev/video0 --list-formats-ext
v4l2-ctl -d /dev/video1 --list-formats-ext
```

What to look for:

- `MJPG` or `YUYV` usually means a normal webcam format
- `GREY`, `BA81`, `GBRG`, `RGGB`, or similar Bayer/raw formats often produce green or noisy output in apps that expect a regular color stream

Try the same node in a native viewer to see whether the issue is system-wide or Electron-specific:

```bash
ffplay -f v4l2 -input_format mjpeg /dev/video0
ffplay -f v4l2 -input_format yuyv422 /dev/video0
```

Interpret the result like this:

- If `ffplay`, Cheese, or another native camera app also shows green output, the problem is in the Linux camera stack or driver negotiation.
- If native apps look correct but Facenox stays green, Electron/Chromium is likely picking a bad format for that device.

### Practical workarounds

- Switch to the other camera option in Facenox if one entry is the RGB node and the other is an IR/raw node.
- Test the camera in another Linux app first to identify which device node is the usable one.
- On rolling distros like Tumbleweed, try a newer or older kernel if the issue started after an update.
- If your laptop uses Intel IPU/MIPI hardware, check whether the system is routing the camera through `libcamera` or exposing incomplete V4L compatibility nodes.

When reporting this issue, include:

- distro and version, for example `openSUSE Tumbleweed`
- desktop session, for example Wayland or X11
- output of `v4l2-ctl --list-devices`
- output of `v4l2-ctl -d /dev/videoX --list-formats-ext` for the affected node
- whether native apps also show the same green preview

## Recognition works slowly

The default setup uses CPU inference. That is the safest development baseline.

If performance is lower than expected:

- close other camera-heavy apps
- use a smaller test group first
- verify that you did not accidentally install an incompatible GPU runtime

Do not assume GPU inference is broken just because CPU performance is slower. CPU is the default path.

## Management Dashboard Beta pairing fails

Common causes:

- wrong Remote Sync URL
- expired or already-claimed pairing code
- Remote Sync deployment missing required environment variables
- the device cannot reach the Facenox Management Dashboard

What to verify:

- the Remote Sync URL is correct and includes the protocol, for example `https://cloud.example.com`
- the pairing code is still valid
- the Remote Sync server can respond to `POST /api/device/pair`

## Remote Sync fails

Remote Sync failure should not stop local attendance. If local attendance stops, that is a separate problem.

For sync issues, check:

- the device is still paired
- the stored device token has not been revoked
- the Remote Sync deployment is reachable
- the last sync message in the Management Dashboard Beta settings panel

The current sync model is snapshot-based. A failed Remote Sync push does not mean local attendance data was lost.

## Initial sync never appears in the dashboard

After pairing, the desktop attempts an immediate first sync. If that does not appear in the dashboard:

- confirm that pairing succeeded fully
- check the last sync message in the desktop app
- inspect the Remote Sync deployment logs for `/api/sync/push`
- retry with the manual `Sync Now` button

## Need deeper inspection?

When the problem is not obvious, gather:

- operating system and version
- whether you are running from source or from a packaged build
- whether the issue is desktop-only or Management Dashboard Beta related
- the exact error message shown by the app

Then open an issue with reproduction steps or a security advisory if the report is security-sensitive.

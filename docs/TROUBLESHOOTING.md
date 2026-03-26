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

## Camera access fails

Check these basics first:

- another app is not already holding the camera
- OS camera permissions allow Facenox to use the device
- the selected camera in Facenox still exists

If the wrong device is selected, switch cameras in the desktop settings and retry.

## Recognition works slowly

The default setup uses CPU inference. That is the safest development baseline.

If performance is lower than expected:

- close other camera-heavy apps
- use a smaller test group first
- verify that you did not accidentally install an incompatible GPU runtime

Do not assume GPU inference is broken just because CPU performance is slower. CPU is the default path.

## Cloud Beta pairing fails

Common causes:

- wrong cloud base URL
- expired or already-claimed pairing code
- cloud deployment missing required environment variables
- the device cannot reach the Facenox Cloud server

What to verify:

- the cloud URL is correct and includes the protocol, for example `https://cloud.example.com`
- the pairing code is still valid
- the cloud server can respond to `POST /api/device/pair`

## Cloud sync fails

Cloud sync failure should not stop local attendance. If local attendance stops, that is a separate problem.

For sync issues, check:

- the device is still paired
- the stored device token has not been revoked
- the cloud deployment is reachable
- the last sync message in the Cloud Beta settings panel

The current sync model is snapshot-based. A failed cloud push does not mean local attendance data was lost.

## Initial sync never appears in the cloud

After pairing, the desktop attempts an immediate first sync. If that does not appear in the cloud:

- confirm that pairing succeeded fully
- check the last sync message in the desktop app
- inspect the cloud deployment logs for `/api/sync/push`
- retry with the manual `Sync Now` button

## Need deeper inspection?

When the problem is not obvious, gather:

- operating system and version
- whether you are running from source or from a packaged build
- whether the issue is desktop-only or Cloud Beta related
- the exact error message shown by the app

Then open an issue with reproduction steps or a security advisory if the report is security-sensitive.

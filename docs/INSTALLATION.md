# Installation

This guide covers local development and desktop builds for the open source Facenox repository.

## Prerequisites

- Windows, macOS, or Linux
- Node.js 18 or newer
- Python 3.10 or newer
- `pnpm`
- a webcam for live recognition testing

Recommended for development:

- 8 GB RAM or more
- a recent x86-64 CPU with AVX2 support

## Repository Layout

- `app/`: Electron desktop app
- `server/`: local Python backend
- `docs/`: project documentation

## Local Development Setup

### 1. Clone the repository

```bash
git clone https://github.com/facenox/facenox.git
cd facenox
```

### 2. Create the Python environment

The desktop app looks for a Python interpreter in the local server virtual environment first, so create the virtual environment inside `server/venv`.

```bash
cd server
python -m venv venv
```

Activate it:

```bash
# Windows
venv\Scripts\activate

# macOS / Linux
source venv/bin/activate
```

Install backend dependencies:

```bash
pip install -r requirements.txt
```

On Linux, `opencv-python` also depends on system GLib libraries that are not bundled in the Python wheel. If backend startup fails with an error like `ImportError: libgthread-2.0.so.0: cannot open shared object file`, install the GLib runtime from your distro first.

Examples:

```bash
# openSUSE Tumbleweed
sudo zypper install libgthread-2_0-0

# Debian / Ubuntu
sudo apt install libglib2.0-0

# Fedora
sudo dnf install glib2
```

Optional dependency sets:

```bash
# Formatter and linter
pip install -r requirements-dev.txt

# PyInstaller packaging/build dependencies
pip install -r requirements-build.txt
```

### 3. Install desktop dependencies

```bash
cd ../app
pnpm install
```

### 4. Start the desktop app

From the repository root:

```bash
cd ..
pnpm dev
```

This starts the Electron development app. The app is responsible for starting the local Python backend. You do not need to run the FastAPI server separately for normal desktop development.

## Optional GPU Runtime

The default requirements install `onnxruntime` for CPU execution. If you are deliberately testing GPU inference, replace it with the GPU build that matches your environment and drivers.

Do not switch to the GPU runtime unless you actually need it. CPU is the safer default for most contributors.

## Build Commands

Run these from `app/`:

```bash
pnpm build
pnpm dist:win
pnpm dist:mac
pnpm dist:linux
```

Desktop build output is written under `app/dist` and related build folders used by Electron Builder.

When packaging the Python backend directly, make sure the build environment has:

```bash
cd server
pip install -r requirements-build.txt
```

## Troubleshooting

See [docs/TROUBLESHOOTING.md](TROUBLESHOOTING.md) if the backend fails to start, the camera is unavailable, or Management Dashboard Beta pairing and sync fail.

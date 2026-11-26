<a id="readme-top"></a>

<h1 align="center">
  <img src="docs/assets/header.png" alt="Facenox - Privacy-first Face Recognition Software" width="100%">
</h1>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-000000?style=flat&logo=git&logoColor=f2f5f7&labelColor=0d1117" alt="License"></a>
  <a href="https://github.com/facenox/facenox/releases"><img src="https://img.shields.io/github/v/release/facenox/facenox?style=flat&logo=git&logoColor=f2f5f7&labelColor=0d1117&color=0891b2" alt="Version"></a>
  <a href="https://github.com/facenox/facenox/releases"><img src="https://img.shields.io/github/downloads/facenox/facenox/total?style=flat&logo=github&logoColor=f2f5f7&labelColor=0d1117&color=22c55e" alt="Downloads"></a>
  <a href="https://github.com/facenox/facenox/stargazers"><img src="https://img.shields.io/github/stars/facenox/facenox?style=flat&logo=github&logoColor=f2f5f7&labelColor=0d1117&color=22d3ee" alt="Stars"></a>
</p>

<p align="center">
  <a href="#why-facenox">Why Facenox</a> •
  <a href="#features">Features</a> •
  <a href="#performance">Benchmark</a> •
  <a href="#offline-first-behavior">Offline-First</a> •
  <a href="#download">Download</a> •
  <a href="#documentation">Documentation</a> •
  <a href="#development-quickstart">Quickstart</a>
</p>

<p align="center">
  <strong>Facenox is open-source, privacy-first face recognition software for real-time attendance tracking.</strong><br>
  No face photos are stored. Biometric templates are encrypted at rest. Recognition works without internet.
</p>

<p align="center">
  <img src="docs/assets/screenshots/02-face-recognition-live.png" alt="Facenox Desktop UI - Active Scan" width="100%">
</p>

## Screenshots

<details>
<summary><strong>UI Gallery</strong></summary>

### Main Interface

![Camera Preview](docs/assets/screenshots/01-camera-preview.png)
<br/>
![Face Recognition](docs/assets/screenshots/02-face-recognition-live.png)
_Primary control interface for video hardware setup and active biometric scanning, featuring real-time face detection and multi-subject tracking._

### Overview

![Attendance Dashboard](docs/assets/screenshots/03-attendance-dashboard.png)
_Overview dashboard displaying real-time metrics for 'Present Today' and 'Late Arrivals' alongside a live Activity Log._

### Reports

![Reports](docs/assets/screenshots/04-reports-management.png)
_Reports interface detailing attendance records, featuring built-in tools for manual session editing and CSV data export._

### Members

![Members](docs/assets/screenshots/05-member-enrollment.png)
_Member management interface for profile administration, role assignment, and biometric enrollment._

### General

![General Settings](docs/assets/screenshots/06-settings-general.png)
_Configuration controls for core attendance mechanics, including Entry/Exit modes, Late Tracking thresholds, Duplicate Prevention cooldowns, and Recognition Limits._

### Security & Anti-Spoofing

![Security Settings](docs/assets/screenshots/07-settings-security.png)
_Configuration panel for Anti-spoofing (Liveness Verification) toggles and Data Retention policies._

### Data & Storage

![Data and Storage Settings](docs/assets/screenshots/08-settings-database-sync.png)
_Data and storage management panel detailing system clock accuracy validation, audit logs, and encrypted `.facenox` archive backups/restores._

</details>

---

## Why Facenox

Facenox records attendance with a standard computer and webcam. Face detection, matching, and liveness verification run locally on your machine—even when internet access is unavailable.

- **Privacy by design:** Raw camera frames are never stored or uploaded, and biometric templates stay encrypted at rest. See [privacy documentation](docs/PRIVACY.md).
- **Works offline:** Record attendance continuously during internet disruptions; sync resumes automatically when connectivity returns.
- **Unified Cloud dashboard:** Link a free Facenox Cloud workspace during setup to monitor sites, manage directories, and export attendance and DTR reports from any browser.
- **No GPU required:** Real-time matching verified on standard CPUs.

## Features

- **On-Device AI Inference:** Local face detection and recognition with ByteTrack multi-subject tracking and liveness verification.
- **Cross-Platform:** Supports Windows, macOS, and Linux.
- **Cloud Directory & Sync:** Manage members, groups, and device policies from Facenox Cloud, with AES-256-GCM encrypted face-template sync across paired computers on eligible plans.
- **Attendance Tracking:** Automated session recording and CSV/JSON exports.
- **Secure Storage:** Encrypted local biometric storage and password-protected `.facenox` backups.

## Performance

### Hardware Compatibility

- **No GPU Required:** Real-time matching on standard CPUs.
- **Environment:** Optimized for controlled lighting and consistent setups.
- **Hardware:** Verified on hardware as old as 2nd-gen Intel i7 (2011), 4th-gen i3 (2015), and 8th-gen i5 (2018) laptops.

### Performance Benchmark

Evaluated on the standard **LFW (Labeled Faces in the Wild)** dataset with **500 registered identities** on an Intel Core i5-8350U CPU without a dedicated GPU:

![LFW Benchmark Face Grid](docs/assets/screenshots/lfw_benchmark_grid.png)

| Metric | Result | Target | Status |
| :--- | :---: | :---: | :---: |
| **Average search latency** | `14.56 ms` | < 50 ms | Passed |
| **Max search latency** | `52.34 ms` | < 150 ms | Passed |
| **Security (False match rate)** | `0.0%` | < 0.1% | Passed |
| **Rejection accuracy (TNR)** | `100.0%` | > 99.0% | Passed |
| **Recognition accuracy (TPR)** | `94.0%` | > 90.0% | Passed |

- **Security:** Zero false matches across the entire 500-profile test. No unregistered face was accepted as a known member.
- **Speed:** It takes less than 0.02 seconds to search and match a face against all 500 profiles in the database.
- **Accuracy:** It successfully recognizes registered members on the first try, even with changes in pose, expression, or lighting conditions.

To run the exact same test locally:
```bash
cd server
python tests/stress_test_recognition.py
```
*(The script will automatically download the test faces, run the simulation, and clean up afterward.)*

> [!NOTE]
> **Scaling:** The benchmark above represents a worst-case scenario, searching all 500 profiles with no filtering. In actual use, Facenox supports both Universal **"All Groups"** multi-group scanning and single-group active filtering to match your organization's setup with minimal latency.

## Offline-First Behavior

Link your Facenox Cloud workspace once on first launch to provision your location and sync your directory. After setup, Facenox Desktop keeps running locally even when internet access is unavailable:

- Recognition, liveness verification, and attendance recording continue without interruption.
- Attendance is written to a local SQLite database and syncs automatically when connectivity returns.
- Settings and encrypted `.facenox` backups remain accessible locally. Keep separate backups to protect against deletion or device failure.

## How it works

### Where is the data stored?

Attendance logs, directory cache, and biometric templates are stored in a local SQLite database with templates encrypted at rest. Attendance and directory data sync with Facenox Cloud, and eligible plans sync AES-256-GCM encrypted face templates between paired computers using Cloud-managed site keys.

### Does it need the internet?

Only for the one-time Cloud sign-in on first setup, background sync, update checks, and user-triggered system-time comparisons. Camera frames are processed on your computer, and day-to-day face recognition and attendance recording run completely offline.

### What hardware do I need?

It's designed for standard CPUs and has been tested on hardware as old as 2nd-gen Intel i7 (2011), 4th-gen i3 (2015), and 8th-gen i5 (2018) laptops. No dedicated GPU or CUDA setup is required.

### How do I protect my data?

Protect access to the computer and keep password-protected `.facenox` backup archives separately. Raw camera frames are never saved or uploaded. See [Privacy and Data Handling](docs/PRIVACY.md) and [SECURITY.md](SECURITY.md) for data boundaries and verification details.

## Roadmap

- [x] Support for cross-platform native installers (Windows, macOS, Linux).
- [x] Attendance trends and site-level reporting in Facenox Cloud.
- [ ] Software Signing.

## Download

Download the latest prebuilt binaries for your platform (a free Facenox Cloud account is required on first launch to link your workspace):

<p align="left">
  <a href="https://github.com/facenox/facenox/releases/latest"><img src="https://img.shields.io/badge/Windows-Download_.exe-0078D6?style=for-the-badge&logo=windows&logoColor=white" alt="Download Windows"></a>
  <a href="https://github.com/facenox/facenox/releases/latest"><img src="https://img.shields.io/badge/macOS-Download_.dmg-000000?style=for-the-badge&logo=apple&logoColor=white" alt="Download macOS"></a>
  <a href="https://github.com/facenox/facenox/releases/latest"><img src="https://img.shields.io/badge/Linux-Download_.AppImage_/_deb-FCC624?style=for-the-badge&logo=linux&logoColor=black" alt="Download Linux"></a>
</p>

For all available releases and architecture packages, visit the [GitHub Releases](https://github.com/facenox/facenox/releases/latest) page. To build from source, follow the [Installation Guide](docs/INSTALLATION.md).

<details>
<summary><strong>Installation Notes (OS security prompts until code signing is finalized)</strong></summary>

<br/>

**Windows (SmartScreen):** If blocked, click **More info** then **Run anyway**.

<img src="docs/assets/smartscreen_warning.png" alt="Windows SmartScreen warning" width="350">

**macOS (Gatekeeper):** If blocked, **Right-click** the app, select **Open**, then confirm the prompt.

<img src="docs/assets/macos_gatekeeper_warning.png" alt="macOS Gatekeeper warning" width="350">

**Linux (AppImage / Debian Package):**

*Using the AppImage:*
1. Make the downloaded `.AppImage` file executable by right-clicking it -> **Properties** -> **Permissions** -> checking **Is executable** (or by running `chmod +x Facenox-Linux-*.AppImage` in the terminal).
2. Double-click the file to execute it. If prompted with a security warning (e.g., in KDE Dolphin), click **Continue**.

<img src="docs/assets/linux_warning.png" alt="Linux AppImage warning" width="500">

*Compatibility Note:* Modern Linux distributions (e.g., Ubuntu 22.04+) require `libfuse2` to mount and run AppImages. If the app fails to start, install it by running:
```bash
sudo apt update && sudo apt install libfuse2
```
*(Warning: Do not install the package named `fuse` as it can conflict with your desktop environment.)*

*Using the Debian Package (.deb):*
1. Install by running the following commands in the terminal (recommended to automatically resolve dependencies):
   ```bash
   sudo apt update
   sudo apt install ./Facenox-Linux-*.deb
   ```
   *(Note: The `./` prefix is required for `apt` to identify the file as a local package.)*
2. Alternatively, double-click the `.deb` file to open it in your system's Software Center and click **Install**.

</details>

## Documentation

- [GETTING_STARTED.md](docs/GETTING_STARTED.md): Packaged-app setup for administrators.
- [FEATURES.md](docs/FEATURES.md): Capabilities and out-of-scope items.
- [ARCHITECTURE.md](docs/ARCHITECTURE.md): System design and sync boundaries.
- [INSTALLATION.md](docs/INSTALLATION.md): Local development setup.
- [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md): Common setup and runtime issues.
- [CODE_SIGNING_POLICY.md](docs/CODE_SIGNING_POLICY.md): Release identity and trust rules.
- [PRIVACY.md](docs/PRIVACY.md): Data handling and privacy policy.
- [SECURITY.md](SECURITY.md): Vulnerability reporting policy.
- [TESTING.md](app/TESTING.md): Frontend and Electron app testing conventions.

## Tech Stack

### Local Backend

- **Runtime:** Python 3.10+ (FastAPI)
- **Inference:** ONNX Runtime, OpenCV
- **Tracking:** ByteTrack (High-performance MOT)
- **Anti-Spoofing:** AuraFAS (Custom Dual-Stream ONNX Liveness Engine)
- **Storage:** SQLite, SQLAlchemy, Alembic

### Desktop App

- **Framework:** Electron, React 19
- **Build Tooling:** Vite, TypeScript, Tailwind CSS

## Development Quickstart

```bash
# 1. Clone the repo
git clone https://github.com/facenox/facenox.git
cd facenox

# 2. Setup Local Backend
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate (Windows)
pip install -r server/requirements.txt

# 3. Setup Desktop App
pnpm install

# 4. Run Development Workspace
pnpm dev                  # Windows / Cross-platform
# or ./dev-start.sh       # macOS / Linux helper script
```

## Contributing

Pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a PR, especially for changes affecting privacy or biometric data.

## Acknowledgments

- [FastAPI](https://fastapi.tiangolo.com/)
- [ONNX Runtime](https://onnxruntime.ai/)
- [OpenCV](https://opencv.org/)
- [Electron](https://www.electronjs.org/)
- [React](https://react.dev/)
- [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md)

## License

Facenox is licensed under the **GNU AGPL v3**. See [LICENSE](LICENSE) for details.

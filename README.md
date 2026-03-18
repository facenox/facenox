<a id="readme-top"></a>

> [!CAUTION]
> This is the official open source repository for Suri. Treat other repositories, installers, and downloads as unverified unless they come from the official Suri channels.

<a href="https://github.com/SuriAI/suri">
  <img src="app/public/assets/header.png" alt="Suri header" width="100%">
</a>

<div align="center">

[![Contributors][contributors-shield]][contributors-url]
[![Forks][forks-shield]][forks-url]
[![Stargazers][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]
[![AGPL License][license-shield]][license-url]

</div>

## Suri

Suri is an open source desktop attendance app built for local face recognition. It keeps recognition, attendance capture, biometric templates, and the primary database on the local machine, so the desktop app stays usable offline and does not depend on a cloud biometric service.

Suri can optionally pair with Suri Cloud for centralized reporting, device pairing, and sync visibility. The desktop app remains the biometric engine.

<div align="center">
  <img src="app/public/assets/banner.png" alt="Suri application screenshot" width="100%">
</div>

## Why Suri

| Local-first | Offline-ready | Consent-aware | Encrypted |
| --- | --- | --- | --- |
| Recognition and attendance stay on the desktop. | Core attendance workflows keep working without internet. | Enrollment and matching respect biometric consent. | Biometric templates are encrypted locally and vault exports are password-protected. |

## Core Capabilities

- Local face detection, recognition, and anti-spoofing
- Group and member management
- Attendance records, sessions, and exports
- Consent-aware biometric enrollment and deletion
- Encrypted local biometric storage
- Password-protected `.suri` vault backup and restore
- Optional Cloud Beta pairing with manual and background sync

## Cloud Beta

Suri Cloud is an optional companion service for:

- centralized reporting
- device pairing
- sync monitoring
- organization and site-level visibility

The desktop app pushes attendance snapshots to the cloud. Raw face images, biometric templates, embeddings, and face matching stay on-device.

## Offline-First Behavior

Suri Desktop continues to work locally when internet access is unavailable:

- recognition still works
- attendance is still recorded locally
- local settings and vault operations still work

Cloud pairing, cloud sync, and cloud dashboard updates resume when connectivity returns.

## Download

[![Release](https://img.shields.io/github/v/release/SuriAI/suri?label=Latest%20Release&color=4caf50&v=1)](https://github.com/SuriAI/suri/releases/latest)

Prebuilt binaries are currently published for Windows. If you are on macOS or Linux, build from source using [docs/INSTALLATION.md](docs/INSTALLATION.md).

### Installation Notes

Suri is still early-stage software. Desktop installers may trigger OS trust prompts until code-signing and notarization are in place.

#### Windows SmartScreen

If Windows shows the SmartScreen warning:

1. Select **More info**.
2. Select **Run anyway**.

<img src="app/public/assets/smartscreen_warning.png" alt="Windows SmartScreen warning" width="400">

#### macOS Gatekeeper

If macOS blocks the app because the developer is unidentified:

1. Right-click the downloaded app or disk image.
2. Select **Open**.
3. Confirm the prompt.

<img src="app/public/assets/macos_gatekeeper_warning.png" alt="macOS Gatekeeper warning" width="400">

## Documentation

- [docs/FEATURES.md](docs/FEATURES.md): features, Cloud Beta scope, and out-of-scope items
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): desktop architecture and desktop-cloud boundaries
- [docs/INSTALLATION.md](docs/INSTALLATION.md): local development and desktop build setup
- [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md): common setup and runtime issues
- [docs/PRIVACY.md](docs/PRIVACY.md): data handling, consent, backups, and cloud sync boundaries
- [SECURITY.md](SECURITY.md): supported version policy and vulnerability reporting

## Tech Stack

### Desktop

- Electron
- React 19
- TypeScript
- Vite
- Tailwind CSS

### Local backend

- Python 3.10+
- FastAPI
- ONNX Runtime
- OpenCV
- SQLAlchemy
- Alembic
- SQLite

## Development

See [docs/INSTALLATION.md](docs/INSTALLATION.md) for the full setup flow.

Quick start:

```bash
git clone https://github.com/SuriAI/suri.git
cd suri
cd server
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
cd ..
cd app
pnpm install
cd ..
pnpm dev
```

## Contributing

Pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a PR, especially if you touch privacy, sync, biometrics, or storage behavior.

## License

Suri is licensed under the GNU AGPL v3. See [LICENSE](LICENSE).

Third-party notices live in [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).

## Acknowledgments

- [FastAPI](https://fastapi.tiangolo.com/)
- [ONNX Runtime](https://onnxruntime.ai/)
- [Electron](https://www.electronjs.org/)
- [React](https://react.dev/)
- [OpenCV](https://opencv.org/)

[contributors-shield]: https://img.shields.io/github/contributors/SuriAI/suri.svg?style=for-the-badge&color=000000&v=1
[contributors-url]: https://github.com/SuriAI/suri/graphs/contributors
[forks-shield]: https://img.shields.io/github/forks/SuriAI/suri.svg?style=for-the-badge&color=000000&v=1
[forks-url]: https://github.com/SuriAI/suri/network/members
[stars-shield]: https://img.shields.io/github/stars/SuriAI/suri.svg?style=for-the-badge&color=000000&v=1
[stars-url]: https://github.com/SuriAI/suri/stargazers
[issues-shield]: https://img.shields.io/github/issues/SuriAI/suri.svg?style=for-the-badge&color=000000&v=1
[issues-url]: https://github.com/SuriAI/suri/issues
[license-shield]: https://img.shields.io/github/license/SuriAI/suri.svg?style=for-the-badge&color=000000&v=1
[license-url]: LICENSE

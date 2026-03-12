
<a id="readme-top"></a>
> [!CAUTION]
> This is the official open source repository for Suri. Any other repositories or downloads are not owned by us.


<a href="https://github.com/SuriAI/suri">
  <img src="app/public/assets/header.png" alt="Suri Header" width="100%">
</a>

<div align="center">

[![Contributors][contributors-shield]][contributors-url]
[![Forks][forks-shield]][forks-url]
[![Stargazers][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]
[![AGPL License][license-shield]][license-url]

</div>

<div align="center">
  <p align="center">
    Local-first, Real-time attendance tracking with face recognition.
    <br />
    <a href="docs/FEATURES.md"><strong>Explore Features</strong></a>
    <br />
    <br />
    <a href="docs/INSTALLATION.md">Setup Guide</a>
    &middot;
    <a href="https://github.com/SuriAI/suri/issues/new?labels=bug&template=bug-report---.md">Report Bug</a>
    &middot;
    <a href="https://github.com/SuriAI/suri/issues/new?labels=enhancement&template=feature-request---.md">Request Feature</a>
  </p>
</div>

<br />

<!-- INTRO -->
**Suri** is a desktop application for real-time attendance tracking with face recognition. Detection, recognition, and biometric storage stay on the local machine, which keeps the system usable offline and reduces exposure of sensitive data.

<div align="center">
  <br />
  <img src="app/public/assets/banner.png" alt="Suri Application Screenshot" width="100%" />
  <br />
</div>

| **Local First** | **Consent Aware** | **Encrypted** |
|:---|:---|:---|
| Detection, recognition, and storage run on the device. | Biometric registration requires consent, and the registration view can shield non-consenting members. | Biometric templates are encrypted locally, and vault backups are password-protected. |

---
## Download

[![Release](https://img.shields.io/github/v/release/SuriAI/suri?label=Latest%20Release&color=4caf50&v=1)](https://github.com/SuriAI/suri/releases/latest)

> [!NOTE]
> **Pre-compiled binaries are currently only available for Windows (`.exe`).**
> macOS and Linux users can [build from source manually](docs/INSTALLATION.md#building-for-production).

> [!IMPORTANT]
> Please see the [Installation Notes](#-installation-notes) below before installing.

---
### Installation Notes

> [!IMPORTANT]
> **Suri is currently in Early Access.** Because we are an independent open-source project, our binaries are not yet "notarized" by Microsoft or Apple. 

#### **For Windows Users:**
If Windows SmartScreen (blue window) appears:
1.  Click **More info**.
2.  Click **Run anyway**.

<img src="app/public/assets/smartscreen_warning.png" alt="Windows SmartScreen Warning" width="400" />

<br />

*We are currently in the process of applying for SignPath OSS to eliminate this warning.*

#### **For macOS Users:**
If you see the "Unidentified Developer" warning:
1.  **Right-click** `Suri.dmg` in your Applications folder/Downloads.
2.  Select **Open** from the menu.
3.  Click **Open** again in the dialog box.

<img src="app/public/assets/macos_gatekeeper_warning.png" alt="macOS Gatekeeper Warning" width="400" />

<br />

*This is a one-time step to grant permission.*

---
## Documentation

Project docs:

- [**Features & Capabilities**](docs/FEATURES.md) - Groups, registration, attendance flows, and exports.
- [**Architecture & Stack**](docs/ARCHITECTURE.md) - How the Electron app, local API, and database fit together.
- [**Installation & Setup**](docs/INSTALLATION.md) - Build and run instructions.
- [**Troubleshooting**](docs/TROUBLESHOOTING.md) - Common setup and runtime issues.
- [**Privacy & Security**](docs/PRIVACY.md) - What is stored, how consent works, and how biometric data is protected.

<!-- TECH STACK -->
## Tech Stack

<p align="center">
  Suri uses a small desktop-focused stack built around local execution.
</p>

<div align="center">
    <img src="https://skillicons.dev/icons?i=electron,react,vite,tailwindcss,python,fastapi,sqlite,opencv&theme=dark" />
</div>

<!-- ROADMAP -->
## Roadmap

### Phase 1: Local Foundation (Completed)
- [x] **Face Recognition Pipeline**: Local face recognition and liveness detection.
- [x] **Data Integrity**: Atomic System Backups & Encrypted Vaults (.suri).
- [x] **Privacy Controls**: Local storage, biometric consent tracking, and Privacy Shield enforcement.

### Phase 2: Connectivity (In-Progress)
- [ ] **Multi-Camera**: Parallel RTSP stream support for large venues.
- [ ] **Backup Sync**: Optional encrypted backup synchronization between trusted deployments.

### Phase 3: Ecosystem (Future)
- [ ] **Web Dashboard**: Centralized reporting and administration around local Suri deployments.
- [ ] **Mobile Companion**: Remote attendance check-in and automated notifications.


Visit the [issues page](https://github.com/SuriAI/suri/issues) to submit feature requests.

<!-- CONTRIBUTING -->
## Contributing

Suri is open source. If you want to help make it better, pull requests are welcome.

1. Fork the project
2. Create a branch (`git checkout -b feature/AmazingFeature`)
3. Commit what you've built (`git commit -m 'Add some AmazingFeature'`)
4. Push it to your fork (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

<!-- LICENSE -->
## License

Distributed under the **AGPL-3.0 License**. See `LICENSE` for more information.

This project relies on open source software. See [Third Party Licenses](THIRD_PARTY_LICENSES.md) for details.

<!-- ACKNOWLEDGMENTS -->
## Acknowledgments

*   [FastAPI](https://fastapi.tiangolo.com/) - High-performance local API framework.
*   [ONNX Runtime](https://onnxruntime.ai/) - Local inference runtime.
*   [Electron](https://www.electronjs.org/) - Native desktop runtime.
*   [React](https://react.dev/) - Desktop UI layer.
*   [OpenCV](https://opencv.org/) - Real-time image processing.

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- MARKDOWN LINKS & IMAGES -->
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

[Electron.js]: https://img.shields.io/badge/Electron-2B2E3A?style=for-the-badge&logo=electron&logoColor=9FEAF9
[Electron-url]: https://www.electronjs.org/
[React.js]: https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB
[React-url]: https://reactjs.org/
[Python.org]: https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white
[Python-url]: https://www.python.org/
[FastAPI]: https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white
[FastAPI-url]: https://fastapi.tiangolo.com/
[ONNX]: https://img.shields.io/badge/ONNX-005CED?style=for-the-badge&logo=onnx&logoColor=white
[ONNX-url]: https://onnxruntime.ai/
[TailwindCSS]: https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white
[TailwindCSS-url]: https://tailwindcss.com/
[Vite]: https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white
[Vite-url]: https://vitejs.dev/
[SQLite]: https://img.shields.io/badge/SQLite-07405E?style=for-the-badge&logo=sqlite&logoColor=white
[SQLite-url]: https://www.sqlite.org/
[SQLAlchemy]: https://img.shields.io/badge/SQLAlchemy-D71F00?style=for-the-badge&logo=sqlalchemy&logoColor=white
[SQLAlchemy-url]: https://www.sqlalchemy.org/

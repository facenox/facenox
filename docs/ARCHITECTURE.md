# System Architecture

Suri is currently a **local-first desktop application**. The implemented system in this repository runs face processing, storage, and attendance logic on the local machine.

## Current Architecture

```mermaid
graph TD
    subgraph UI [Renderer Process]
        React[React Frontend]
    end

    subgraph Main [Main Process]
        Electron[Electron Core]
    end

    subgraph Backend [AI Engine]
        FastAPI[FastAPI Backend]
        DB[(Local SQLite)]
    end

    React <-->|IPC| Electron
    React <-->|HTTP/Multipart| FastAPI
    FastAPI <--> DB
```

## Core Components

### 1. High-Performance Processing Layer
-   **Electron Renderer** provides the desktop UI and handles direct binary transport.
-   **Electron Main** manages app lifecycle, system-level orchestration, and secure token generation.
-   **FastAPI Backend** (localhost-only) provides high-performance endpoints for attendance, consent, and biometrics.
-   **ONNX-based Recognition Pipeline** runs on the local machine using raw binary buffers (OpenCV).

### 2. Standardized Data Flow
1.  **Direct Transport**: The UI communicates directly with the Python backend via authenticated HTTP for image processing, bypassing Electron IPC bottlenecks.
2.  **Binary First**: Images are moved as raw `multipart/form-data` (Blobs/Files), eliminating Base64 overhead.
3.  **Unified Auth**: All renderer-to-backend requests are secured with an `X-Suri-Token` injected by the service layer.
4.  **Local Storage**: SQLite stores membership data, settings, and encrypted biometric templates on-device.

### 3. Current Deployment Model
-   **Primary deployment**: single desktop app installation.
-   **System of record**: local SQLite database.
-   **Network dependency**: none for core attendance and recognition workflows.
-   **Biometric processing**: local only in the current implementation.

### 4. Proposed Future Web Dashboard
The project may later add a web dashboard or hosted reporting layer. If that happens, it should be treated as a separate architecture from the current desktop system.

The intended boundary should be:
-   **Desktop app remains the biometric engine**.
-   **Hosted dashboard handles reporting, administration, and sync orchestration**.
-   **Cloud services should not be described as current functionality until implemented and documented**.
-   **Any future networked design should document what data leaves the device, what remains local, and how consent, retention, and deletion are enforced across both systems**.

## Tech Stack (Updated)

### Frontend
-   **Framework**: React 19 + Vite
-   **Style**: Tailwind CSS v4
-   **Runtime**: Electron

### Backend (Local)
-   **Language**: Python 3.10+
-   **API**: FastAPI (Localhost only)
-   **AI**: ONNX Runtime (CPU/GPU)

### Notes
-   **Biometric templates are encrypted at rest locally**.
-   **Vault backups are password-encrypted before being written to disk**.
-   **The current repository should not be read as promising a deployed cloud biometric service**.

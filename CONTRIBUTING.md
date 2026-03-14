# Contributing to Suri

Thanks for considering helping out! Suri is built to provide an accessible, local-first biometric tracking system for organizations that need a secure, high-performance solution without expensive proprietary hardware. **Performance and simplicity are our top priorities.**

## Mission & Principles
Suri is built to run on low-end hardware. When contributing, keep these three principles in mind:
1. **Local-First:** Privacy is paramount. No biometric data should ever leave the device.
2. **Efficiency:** Target CPU-bound environments. Avoid heavy dependencies.
3. **Accessibility:** The UI must be intuitive for non-technical users.

---

## Project Structure
Understanding where everything lives:
```text
suri/
 ├── app/              # Electron frontend (React + TypeScript)
 ├── server/           # Python backend (FastAPI + ONNX Runtime)
 ├── docs/             # Technical and user documentation
 ├── data/             # Local database and biometric storage (ignored)
 └── scripts/          # Workspace automation and build tools
```

---

## Where We Need Help
* **Performance:** Optimizing the Python backend and ONNX model inference.
* **Accuracy:** Improving recognition robustness under poor lighting or varying angles.
* **Accessibility:** Localization (i18n) and UI refinements for standard desktop users.
* **Security:** Hardening local data storage and encryption flows.

---

## Local Development Setup
Suri is a monorepo. We use `pnpm`, but other package managers `npm`, `yarn`, or `bun` will work just fine.

> [!IMPORTANT]
> **Don't commit their respective lockfiles** to the repo. Only `pnpm-lock.yaml` is allowed.

### 1. Prerequisites
- **Python 3.10+**
- **Node.js 18+** & **pnpm**

### 2. Frontend & Tooling Setup
Navigate to the `app/` directory and install dependencies:
```bash
pnpm install
```

### 3. Backend Setup
Navigate to the `server/` directory:
```bash
# Create a virtual environment
python -m venv venv

# Activate (Linux/macOS)
source venv/bin/activate

# Activate (Windows)
venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### 4. Running Development
Suri is split into three parts, each with its own `package.json` for a specific reason:
- **Root:** Orchestrates the entire project (use this to run the app).
- **App:** The Electron/React frontend.
- **Server:** The Python backend automation.

To start the application, **always run the command from the root directory**:
```bash
pnpm dev
```
---

## Development Workflow

### 1. Code Style
We enforce strict style guidelines to keep the codebase maintainable:
- **Frontend (TS/JS):** ESLint + Prettier (handled via `pnpm fix`).
- **Backend (Python):** 
    - **Formatting:** [Black](https://github.com/psf/black)
    - **Linting:** [Ruff](https://github.com/astral-sh/ruff)
    - **Type Hints:** Encouraged for all new logic.

### 2. Branching & Commits
- Create a descriptive branch: `feat/description` or `fix/description`.
- We follow [Conventional Commits](https://www.conventionalcommits.org/):
    - `feat:` for new features.
    - `fix:` for bug fixes.
    - `chore:` for maintenance or script updates.

### 3. Quality Checks
Before pushing, ensure your code meets our quality standards:
```bash
pnpm fix
```

---

## Issue & Pull Request Guidelines

### Opening an Issue
Before creating a new issue:
1. **Search:** Check existing issues to see if it’s already being discussed.
2. **Reproduction:** Provide clear steps to reproduce the bug.
3. **Environment:** Include your OS and hardware specs if performance-related.

### Creating a Pull Request
1. **Atomic PRs:** Keep PRs focused. One problem, one PR.
2. **Template:** Use the provided PR template. Explain *what* changed and *why*.
3. **Verification:** Confirm that `pnpm fix` passes and you have tested the changes.

---

**Bugs & Features:** Use [GitHub Issues](https://github.com/SuriAI/suri/issues).
**Security:** See our [Security Policy](SECURITY.md).
# Contributing to Facenox

Thanks for contributing.

Facenox is a local-first desktop product with a privacy-sensitive domain. Changes that affect biometrics, consent, storage, exports, sync, or deletion need extra care and clear documentation.

## Before You Start

- Read the relevant docs in `docs/`.
- Search existing issues before opening a new one.
- Keep changes focused. Small, reviewable pull requests are easier to merge and safer to reason about.

## Repository Layout

```text
facenox/
  app/     Electron desktop app (React + TypeScript)
  server/  Local FastAPI backend (Python)
  docs/    Project documentation
```

## Local Setup

### JavaScript dependencies

```bash
cd app
pnpm install
```

### Python dependencies

```bash
cd server
python -m venv venv

# Windows
venv\Scripts\activate

# macOS / Linux
source venv/bin/activate

pip install -r requirements.txt

# Optional: formatter and linter
pip install -r requirements-dev.txt
```

Dependency files are split on purpose:

- `requirements.txt`: backend runtime dependencies
- `requirements-dev.txt`: development tools such as `black` and `ruff`
- `requirements-build.txt`: packaging dependencies such as `pyinstaller`

### Run the app

From the repository root:

```bash
pnpm dev
```

## Development Guidelines

### 1. Keep the local-first model intact

Do not turn a local desktop workflow into a cloud dependency by accident.

The current rules are simple:

- local attendance must keep working without internet
- biometrics stay local unless a change explicitly documents and justifies otherwise
- cloud sync must not block attendance capture

### 2. Prefer direct language in code and docs

Avoid filler, slogans, and vague claims. If a feature is partial, say it is partial. If a feature is not shipped, do not describe it as if it exists.

### 3. Update docs with behavior changes

If your change affects any of these, update the docs in the same pull request:

- product boundary
- storage behavior
- consent behavior
- backup or restore behavior
- Cloud Beta behavior
- security or privacy expectations

### 4. Keep performance in mind

Facenox runs on desktops in real environments. Avoid unnecessary dependencies and avoid work that adds latency to recognition or attendance capture without a clear payoff.

## Commands

### Desktop app

```bash
cd app
pnpm lint
pnpm format
pnpm build
```

### Python backend

```bash
cd server
npm run lint
npm run format
```

### Root convenience scripts

```bash
pnpm dev
pnpm lint
pnpm format
pnpm fix
```

## Pull Requests

Include the following in your PR description:

- what changed
- why it changed
- how you tested it
- any follow-up work that is intentionally left out

If the change affects privacy or sync behavior, say that explicitly so reviewers know to inspect the boundary carefully.

## Security Reports

Do not open public issues for security vulnerabilities. Follow the process in [SECURITY.md](SECURITY.md).

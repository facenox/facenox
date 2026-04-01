# Testing

This guide covers the frontend test setup used in `app/`.

The current stack is:

- `Vitest` for the test runner
- `@testing-library/react` for component tests
- `@testing-library/jest-dom` for DOM assertions
- `@testing-library/user-event` for user interactions
- `jsdom` for the default browser-like test environment

## Commands

Run these from `app/`:

```bash
pnpm test
pnpm test:watch
pnpm test:coverage
pnpm test:smoke
```

`pnpm test` is the default local check. Use `pnpm test:coverage` when you want a coverage report before opening a pull request.
Use `pnpm test:smoke` when you want a thin browser-level startup and shell check against the built renderer.

## Test Layout

Frontend tests are intentionally split between colocated test files and shared test support.

### Colocated tests

Keep unit and component tests beside the file they cover:

```text
src/
  components/
    shared/
      Dropdown.tsx
      Dropdown.test.tsx
  electron/
    updater.ts
    updater.test.ts
  utils/
    dateUtils.ts
    dateUtils.test.ts
```

This makes refactors easier and keeps the test close to the feature it protects.

### Shared test support

Put reusable test infrastructure under `src/test/`:

```text
src/
  test/
    setup.ts
    mocks/
    fixtures/
    utils/
```

Current shared pieces:

- `src/test/setup.ts`: global test setup
- `src/test/mocks/`: Electron and window bridge mocks
- `src/test/fixtures/`: reusable typed test data
- `src/test/utils/renderWithProviders.tsx`: shared render helper

### Smoke tests

The smoke layer lives outside `src/`:

```text
e2e/
```

These tests run against the built renderer with Playwright. They are intentionally thin and focus on startup and top-level shell confidence.

## What We Test

The current frontend suite focuses on:

- pure utilities
- stores and state transitions
- extracted business logic
- key renderer components
- Electron-facing wrappers that can be tested without launching the real app

This is a unit and component test setup. It is not an end-to-end browser suite.
There is now also a thin smoke suite for startup and shell behavior, but it is still not a full desktop end-to-end harness.

## Writing Tests Here

### Prefer behavior over implementation details

Test what the user or caller sees:

- rendered states
- visible text
- button behavior
- store updates
- returned values from pure helpers

Avoid asserting internal component state unless there is no better external signal.

### Keep component tests small

If a component is doing too much logic inline, extract the logic into a helper and test that helper directly.

This keeps component tests readable and avoids brittle DOM-heavy assertions.

### Use the shared render helper

For renderer tests, prefer:

```ts
const { user } = renderWithProviders(<MyComponent />)
```

This keeps the wrapper setup consistent and gives each test a ready-to-use `user` instance.

### Use typed fixtures

For attendance, group, and report data, prefer the builders in `src/test/fixtures/` over repeated inline objects.

Examples:

- `createAttendanceGroup()`
- `createAttendanceMember()`
- `createAttendanceRecord()`
- `createAttendanceSession()`
- `createAttendanceReport()`

Override only the fields that matter to the test.

## Electron and Window Mocks

Renderer tests should not depend on a real Electron runtime.

The default setup stubs:

- `window.electronAPI`
- `window.facenoxElectron`
- `window.matchMedia`

If a test needs custom Electron behavior, override the relevant mock in the test instead of bypassing the shared setup.

Smoke tests do the same thing at the browser level by injecting Electron-style globals before the app boots.

## Conventions

- Use `*.test.ts` for logic, hooks, stores, and utilities.
- Use `*.test.tsx` for React components.
- Match the source filename when possible.
- Do not add snapshot tests by default.
- Keep test names direct and specific.
- Reset or isolate shared store state in `beforeEach` when a test mutates it.

## When to Add a Test

Add or update frontend tests when a change affects:

- filtering, sorting, or derived UI logic
- store behavior or persisted settings
- empty states and error states
- sync, updater, or Electron bridge behavior
- any flow that would otherwise need careful manual clicking after every change

If a bug was fixed, prefer adding a regression test in the same pull request.

## Current Boundary

This setup is intentionally focused on fast local feedback inside `app/`.

If we add broader browser or desktop flow testing later, that should live in a separate end-to-end test layer rather than being mixed into the current Vitest suite.

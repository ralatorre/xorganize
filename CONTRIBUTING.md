# Contributing to xorganize

Thank you for helping. This extension runs inside people's logged-in X sessions, so the bar is high in two ways: it must not leak anything, and the code must stay easy to test and change. This page covers both.

Read [docs/SPEC.md](docs/SPEC.md) (technical) and [docs/DESIGN.md](docs/DESIGN.md) (UX) for the area you are changing. If your change alters behaviour, update them in the same pull request.

## Development environment

Everything runs inside Podman containers; nothing is installed on your machine. See [Development in the README](README.md#development) for the commands. Before opening a pull request, run:

```
container/run pnpm check
```

It typechecks, lints, runs the unit tests, builds for Chromium and Firefox plus the diagnostics build, and runs the browser tests. CI runs the same command.

## Privacy and security

- **Least privilege.** Adding a permission, host permission, manifest key or content security policy source needs a written reason in SPEC 6.1 or 6.2. `tests/e2e/manifest.spec.ts` compares the built manifest with an exact list. If it fails, treat that as a design question to discuss, not an expectation to update.
- **Nothing leaves the device.** Extension pages and the worker run under `connect-src 'none'`. Images from X's image server are the only exception (SPEC 6.2).
- **Undetectable by the page.** No `window.postMessage`, no web-accessible resources, and no globals or DOM changes from the capture scripts (SPEC 7.1, 7.2). Tests check this.
- **Untrusted input.** Everything from the page or X's API is `unknown` until a guard has checked it, and is rendered only as text. Lint forbids `innerHTML` and friends.
- **Dependencies.** Prefer the platform and the standard library. A new dependency needs a reason in the pull request, an exact version, and a check that it does nothing on the network or the page that we would not do ourselves.
- **Privacy when privacy and convenience conflict.** Say what the trade-off is in the pull request.

Never commit captured traffic (`*.har`, response dumps), personal exports, credentials, real handles or post content, or screenshots of a real account. Test fixtures are hand-written placeholders. SPEC 16 has the full list.

## Code quality

### Inject dependencies

A module is given what it depends on; it does not reach out for it. That covers the database, browser extension APIs, the DOM, the clock, randomness, timers and message senders.

- Pass dependencies as parameters, or as one object to a factory: `createX(deps)`, with the shape declared as an `interface` next to it.
- Optional dependencies may have a default at the edge, as in `now = Date.now()` or `root: ParentNode = document`. Required ones may not.
- Only `entrypoints/` connects the real implementations. Code in `src/` does not call `library()`, `browser.*` or `indexedDB` directly. No dependency-injection framework: plain functions and objects are enough.
- Exceptions are named and explained in the code. Today there are two: the interceptor (`src/capture/intercept.ts`), whose job is to wrap the page's own `fetch` and `XMLHttpRequest`, and the bridge's built-ins captured at load time (`src/messaging/bridge.ts`), which a page must not be able to replace.

Examples: `createCapture(environment)` in `src/capture/pipeline.ts`, `createWorkerHandler(deps)` in `src/worker/handler.ts`, `createDiagnosticsStore(factory)`, and the functions in `src/db/repo.ts` that take `db` as their first argument.

### One responsibility per unit

Each module, function and component has one reason to change.

| Layer | Does | Examples |
| --- | --- | --- |
| Validation | Turns untrusted input into typed data | `src/guards.ts`, `src/capture/normalise.ts`, `src/messaging/protocol.ts` |
| Decisions | Pure functions: data in, data out | `src/capture/extract.ts`, the merge and sort rules in `src/db/repo.ts`, `src/library/thumbnails.ts` |
| Effects | Database, messaging, DOM | `src/db/repo.ts`, `src/messaging/bridge.ts` |
| Routing | Which message means what, with injected effects | `src/worker/handler.ts`, `src/capture/content.ts` |
| Wiring | Real implementations in, nothing decided | `entrypoints/**` |
| UI | Renders what it is given; calls the actions it is given | `entrypoints/library/components/` |

- An entrypoint's listener hands off to a handler from `src/`; it holds no branching logic of its own.
- Components render. Data loading lives in hooks or loaders that receive their data source, and changes go through functions passed in as props. One component per file.
- A function that needs comments to separate its steps should be several functions.

### Easy to test

- Each unit can be tested without a browser. Pass in stand-ins for its dependencies, and for the database use `fake-indexeddb` with a fresh `new LibraryDatabase(name)`.
- Unit tests (`tests/unit`, Vitest) cover every branch of the decision and routing logic. Browser tests (`tests/e2e`, Playwright) cover wiring, security properties and user-visible flows. Do not test through a browser what a unit test can reach.
- Test behaviour through public interfaces. If a test needs to reach into internals, the code needs a seam.
- Fixtures are builders in `tests/fixtures`, never copies of real responses.
- A bug fix comes with a test that fails without the fix.

### Configurable, but no more than needed

- No magic numbers or strings in the middle of code. Limits, sizes, timeouts, hosts and keys are named constants, defined once in the module that owns them (`MAX_THUMBNAILS`, `POSTS_PER_SOURCE`, `SETTLE_MS`), or in a shared module when several need them (`src/hosts.ts`).
- A value that a caller or a test might reasonably change is an option with that constant as its default: `thumbnailsOf(media, max = MAX_THUMBNAILS)`.
- User preferences are settings, stored in the `meta` table and validated on read with defaults (`readSettings` in `src/db/repo.ts`, SPEC 9.3). The extension never uses the `storage` permission and never fetches remote configuration.
- Build-time switches (`DIAGNOSTICS` in `src/build.ts`) are only for code that must be absent from production builds.
- Do not add configuration nothing uses yet. A named constant can become an option when it is needed.

### Style

- TypeScript in strict mode, no `any`. Explicit imports (auto-imports are off).
- Names come from the domain (post, source, tag, account), not from the implementation.
- Each module opens with a short comment saying what it is responsible for. Other comments say why, not what.
- Prettier formats and ESLint lints; `pnpm check` runs both.
- Prefer deleting code to adding options. Keep large cleanups in their own pull request, separate from feature work.

## Pull requests

- Branch from `main`. `main` is protected: a pull request, passing CI ("Typecheck, lint, test, build" and "Secret scan"), signed commits and linear history are required, and merges are squash merges.
- Keep each pull request to one concern, and say in its description what changed, why, and how it was tested. Mention any privacy or permission trade-off.
- Commit with an address that is safe to make public, such as your GitHub noreply address.

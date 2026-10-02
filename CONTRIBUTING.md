# Contributing

Thanks for helping improve the ResponseDock SDKs. Please report security issues privately as described in [SECURITY.md](SECURITY.md), not in public issues.

## Setup

You need Node.js 20.19 or later (`.nvmrc` pins the version CI uses) and pnpm 9 through Corepack:

```sh
corepack enable
pnpm install
```

## Before you open a pull request

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm package:check   # packs @responsedock/sdk-browser and installs it into a clean project
pnpm preflight       # packs both SDKs and smoke-tests them together in a clean React project
pnpm test:ci         # workflow contract tests
```

CI runs the same checks on every pull request.

If your change affects users of either package (API, behaviour, types or bundle), add a changeset:

```sh
pnpm changeset
```

Changes to tests, docs or CI need no changeset. Maintainers handle versioning and publishing; see [RELEASING.md](RELEASING.md).

## Guidelines

- `@responsedock/sdk-browser` has no runtime dependencies. Keep it that way, and keep it safe to import during server rendering.
- Keep the public API in `src/index.ts` and the package READMEs in sync.
- Add or update tests in `packages/*/test` for behaviour changes.

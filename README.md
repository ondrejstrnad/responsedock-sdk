# ResponseDock SDKs

Embed [ResponseDock](https://responsedock.com) surveys in your web app: inline, in a modal, or launched by product events. This repository holds the open-source client SDKs.

| Package | Description | Version |
| --- | --- | --- |
| [`@responsedock/sdk-browser`](packages/sdk-browser) | Framework-free browser SDK. No runtime dependencies, TypeScript declarations included, safe to import during server rendering. | [![npm](https://img.shields.io/npm/v/@responsedock/sdk-browser)](https://www.npmjs.com/package/@responsedock/sdk-browser) |
| [`@responsedock/sdk-react`](packages/sdk-react) | React 18/19 bindings: `SurveyProvider`, `SurveyEmbed`, `SurveyModal`, `useSurvey`. | [![npm](https://img.shields.io/npm/v/@responsedock/sdk-react)](https://www.npmjs.com/package/@responsedock/sdk-react) |

## Use it

### Hosted script, no build step

ResponseDock serves the browser SDK. `/sdk/0.2/` receives every 0.2.x patch release; use `/sdk/0.2.0/` to pin an exact release.

```html
<!-- ES module -->
<script type="module">
  import { ResponseDock } from 'https://survey.responsedock.com/sdk/0.2/index.js';
  ResponseDock.init({ projectKey: 'pk_live_xxxx' });
  ResponseDock.embed('workspace/survey-slug', '#survey-root');
</script>

<!-- Classic script (tag managers, older CMSs): defines window.ResponseDock -->
<script src="https://survey.responsedock.com/sdk/0.2/responsedock.global.js"></script>
```

### npm

```sh
npm install @responsedock/sdk-browser   # any framework
npm install @responsedock/sdk-react     # React; installs sdk-browser too
```

See each package's README for usage, and the documentation for the full API:

- [Browser SDK](https://docs.responsedock.com/docs/sdk/browser)
- [React SDK](https://docs.responsedock.com/docs/sdk/react)
- [Events and triggers](https://docs.responsedock.com/docs/sdk/events)
- [Share and embed guide](https://docs.responsedock.com/docs/guides/share-and-embed-how-to)

## Development

This is a pnpm 9 workspace and needs Node.js 20.19 or later.

```sh
corepack enable
pnpm install
pnpm lint            # ESLint
pnpm typecheck       # TypeScript, both packages
pnpm build           # dist/ for both packages
pnpm test            # unit tests (node:test)
pnpm package:check   # pack sdk-browser and import it from a clean project
pnpm preflight       # pack both SDKs and smoke-test them together in a clean React project
pnpm test:ci         # workflow contract tests
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the pull request checklist.

## Releases

Versioning uses [Changesets](https://github.com/changesets/changesets), and the two packages are linked.

1. Pull requests that change either SDK include a changeset (`pnpm changeset`).
2. On `main`, the **Release** workflow keeps a *Release SDKs* pull request up to date. That PR bumps the versions and changelogs.
3. After it merges, a maintainer runs the manual **Publish SDKs** workflow. It needs approval for the protected `npm` environment. It rebuilds, tests and packs both SDKs, smoke-tests the tarballs, and publishes them to npm with trusted publishing. `sdk-browser` always goes first.

[RELEASING.md](RELEASING.md) has the full process and the one-time setup.

### Provenance

Every published version carries an [npm provenance attestation](https://docs.npmjs.com/generating-provenance-statements). It links the tarball to the commit and the workflow run in this repository that built it. Verify installed packages with:

```sh
npm audit signatures
```

## Security

Report vulnerabilities privately; see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)

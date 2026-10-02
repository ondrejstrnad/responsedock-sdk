# Releasing the SDKs

`@responsedock/sdk-browser` and `@responsedock/sdk-react` are published to npm by the manual **Publish SDKs** workflow (`.github/workflows/publish.yml`).

- It runs only from `main`, only with the typed confirmation, and only after approval of the protected `npm` environment.
- It typechecks, builds and tests both SDKs, then packs them with `pnpm pack`, which turns `workspace:` ranges into real versions.
- It installs the tarballs into a clean React project and imports them.
- It then publishes the selected tarballs with `npm publish <tarball> --access public --provenance`. `sdk-browser` goes first, and `sdk-react` waits until the `sdk-browser` version it depends on is visible on npm.
- A version that is already on npm is skipped, so re-running after a partial failure is safe.

Authentication uses npm trusted publishing (OIDC), so no long-lived token is stored. npm cannot set up a trusted publisher for a package that doesn't exist yet, so the first publish of each package uses a short-lived token.

## Workflows

| Workflow | Trigger | What it does |
| --- | --- | --- |
| `ci.yml` | pull requests, pushes to `main` and `changeset-release/**`, manual | Workflow contract tests, lint, typecheck, build, tests, `package:check` and the pack/install smoke test. |
| `release.yml` | push to `main` | Opens or updates the *Release SDKs* PR with `changesets/action` using `github.token`. Never publishes. |
| `publish.yml` | manual only | Verifies and publishes the SDKs to npm with provenance. |

GitHub does not start workflows for pushes or pull requests made with `GITHUB_TOKEN`, so the release PR would otherwise get no checks. After updating the PR, `release.yml` runs `gh workflow run ci.yml --ref changeset-release/main`, because `workflow_dispatch` is exempt from that rule. The run reports its checks on the release PR's head commit.

If you make CI a required status check in branch protection, require the `Verify SDKs` check. If the release PR ever shows no checks, run **CI** manually on the `changeset-release/main` branch, or close and reopen the PR.

## One-time setup

1. **Create the GitHub repository and push.** Create `ondrejstrnad/responsedock-sdk` as a public repository and push `main`:

   ```sh
   gh repo create ondrejstrnad/responsedock-sdk --public --source . --remote origin --push
   ```

   Then go to *Settings → Actions → General → Workflow permissions* and tick *Allow GitHub Actions to create and approve pull requests*. Without it, the Release workflow cannot open the release PR. Leave the default token permission at *Read repository contents*; the workflows request the write scopes they need.

   Protecting `main` is recommended: require pull requests and the `Verify SDKs` check.

2. **Create the npm org.** On npmjs.com, go to *Add Organization*, name it `responsedock` and pick the free plan for unlimited public packages. This creates the `@responsedock` scope. Turn on two-factor authentication for your npm account if it is off.

3. **Create the GitHub environment.** In the repository, open *Settings → Environments → New environment* and name it `npm`.
   - *Required reviewers*: add yourself (`ondrejstrnad`). Public repositories support this on every plan. Every publish then waits for your approval.
   - *Deployment branches and tags*: choose *Selected branches and tags* and add the rule `main`. The workflow also refuses other refs.

4. **First publish, using a token:**
   1. On npmjs.com, go to *Access Tokens → Generate New Token → Granular Access Token*.
      - Permissions: *Read and write*.
      - Packages and scopes: the `@responsedock` scope. If the first publish is rejected with 403 or 404, regenerate the token with *All packages*, since the packages don't exist yet.
      - Tick *Bypass two-factor authentication*, because CI cannot enter an OTP.
      - Choose the shortest expiry (1 day is enough).
   2. Save it as the environment secret `NPM_TOKEN` on the `npm` environment (*Settings → Environments → npm → Environment secrets*).
   3. Run **Publish SDKs** with `packages: both`. The steps are under *Per release* below. Provenance is attached even on this token-authenticated run, because the repository is public.

5. **Configure trusted publishing for each package.** On npmjs.com, open each of `@responsedock/sdk-browser` and `@responsedock/sdk-react` → *Settings → Trusted Publisher → GitHub Actions* and enter:
   - Organization or user: `ondrejstrnad`
   - Repository: `responsedock-sdk`
   - Workflow filename: `publish.yml`
   - Environment: `npm`

   With npm 11.15 or later you can do the same from the CLI:

   ```sh
   npm trust github @responsedock/sdk-browser --repo ondrejstrnad/responsedock-sdk --file publish.yml --env npm --allow-publish
   npm trust github @responsedock/sdk-react   --repo ondrejstrnad/responsedock-sdk --file publish.yml --env npm --allow-publish
   ```

6. **Remove the token.**
   - Delete the `NPM_TOKEN` environment secret and revoke the token on npmjs.com.
   - In each package's *Settings → Publishing access*, choose *Require two-factor authentication and disallow tokens*. Trusted publishing keeps working.

   If one package is first published later than the other, repeat steps 4–6 for it.

## Per release

1. In any PR that changes what SDK users see, run `pnpm changeset`, select the affected SDKs, choose the bump and describe the change.
2. When you merge to `main`, the **Release** workflow opens or updates the *Release SDKs* PR, which bumps the versions and changelogs. Wait for its CI checks.
3. Merge the release PR.
4. Go to *Actions → Publish SDKs → Run workflow* on `main`:
   - `packages`: `both`, unless only one SDK changed.
   - Confirmation: `publish @responsedock sdks`.

   Approve the `npm` environment deployment when GitHub asks.
5. Check the run summary and npm:

   ```sh
   npm view @responsedock/sdk-browser version
   npm view @responsedock/sdk-react version
   ```

   The npm package page should show a *Provenance* badge that links to the workflow run. If a run failed partway, re-run it. Versions already on npm are skipped.
6. The hosted script at `https://survey.responsedock.com/sdk/<major.minor>/` is deployed separately with the ResponseDock app. It is not published from this repository.

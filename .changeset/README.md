# Changesets

Add a changeset to every pull request that changes what users of `@responsedock/sdk-browser` or `@responsedock/sdk-react` see: the API, behaviour, types or bundle.

```sh
pnpm changeset
```

Pick the affected packages, choose the semver bump and describe the change for users. The two SDKs are *linked*, so a release that bumps both gives them the same version.

After the pull request merges to `main`, the **Release** workflow opens or updates the *Release SDKs* pull request. That PR bumps the versions and writes the changelogs. Merging it publishes nothing. Publishing is a separate, manual step: the **Publish SDKs** workflow. See [RELEASING.md](../RELEASING.md).

Changelog entries link to the pull request and its author through `@changesets/changelog-github`. That means `pnpm changeset:version` needs a `GITHUB_TOKEN` in the environment if you run it locally. CI always has one.

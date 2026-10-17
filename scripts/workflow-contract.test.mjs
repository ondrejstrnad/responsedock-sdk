// Guards the release and publishing invariants of the GitHub workflows. Run with `node --test scripts/*.test.mjs`.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const [ci, release, publish, setupWorkspace, rootPackage, changesetConfig, browserPackage, reactPackage] = await Promise.all([
  read('.github/workflows/ci.yml'),
  read('.github/workflows/release.yml'),
  read('.github/workflows/publish.yml'),
  read('.github/actions/setup-workspace/action.yml'),
  read('package.json').then(JSON.parse),
  read('.changeset/config.json').then(JSON.parse),
  read('packages/sdk-browser/package.json').then(JSON.parse),
  read('packages/sdk-react/package.json').then(JSON.parse),
]);

function includesAll(source, expected) {
  for (const value of expected) assert.match(source, value);
}

test('CI checks pull requests, main and the release branch with the publish gates', () => {
  includesAll(ci, [
    /^name: CI$/m,
    /^\s+pull_request:$/m,
    /^\s+push:\n\s+branches:\n\s+- main\n\s+- 'changeset-release\/\*\*'$/m,
    /^\s+workflow_dispatch:$/m,
    /^permissions:\n {2}contents: read$/m,
    /persist-credentials: false/,
    /pnpm test:ci/,
    /pnpm lint/,
    /pnpm typecheck/,
    /pnpm build/,
    /pnpm test$/m,
    /@responsedock\/sdk-browser package:check/,
    /node scripts\/sdk-publish-preflight\.mjs --out/,
  ]);
  assert.match(setupWorkspace, /pnpm install --frozen-lockfile/);
  assert.equal(rootPackage.scripts['test:ci'], 'node --test scripts/*.test.mjs');
});

test('the release workflow only opens the version PR, and gets CI onto it', () => {
  includesAll(release, [
    /^\s+push:\n\s+branches:\n\s+- main$/m,
    /^permissions:\n {2}contents: read$/m,
    /^\s+permissions:\n\s+contents: write[^\n]*\n\s+pull-requests: write[^\n]*\n\s+actions: write[^\n]*$/m,
    /changesets\/action@[0-9a-f]{40}/,
    /version: pnpm changeset:version/,
    /title: Release SDKs/,
    /GITHUB_TOKEN: \$\{\{ github\.token \}\}/,
    /persist-credentials: false/,
    // GITHUB_TOKEN pushes start no workflows, but workflow_dispatch does.
    /if: steps\.changesets\.outputs\.pullRequestNumber != ''[\s\S]*?gh workflow run ci\.yml --repo "\$GITHUB_REPOSITORY" --ref "\$RELEASE_BRANCH"/,
    /RELEASE_BRANCH: changeset-release\/\$\{\{ github\.ref_name \}\}/,
  ]);
  assert.doesNotMatch(release, /publish:/, 'the release workflow must never publish');
  assert.doesNotMatch(release, /NPM_TOKEN|id-token/);
  assert.doesNotMatch(release, /secrets\./, 'the release PR uses only github.token');
});

test('publishing is manual, protected, provenance-backed and package-tested', () => {
  includesAll(publish, [
    /^name: Publish SDKs$/m,
    /^\s+workflow_dispatch:$/m,
    /^\s+packages:\n\s+description: [^\n]+\n\s+required: true\n\s+type: choice\n\s+default: both\n\s+options:\n\s+- both\n\s+- sdk-browser\n\s+- sdk-react$/m,
    /if: inputs\.confirmation == 'publish @responsedock sdks' && github\.ref == 'refs\/heads\/main'/,
    /^\s+environment: npm$/m,
    /^permissions:\n {2}contents: read\n {2}id-token: write/m,
    /persist-credentials: false/,
    /pnpm install --frozen-lockfile --ignore-scripts/,
    /both\) packages="sdk-browser sdk-react"/,
    // Tests and package checks run before anything is published.
    /pnpm typecheck[\s\S]*?pnpm --filter @responsedock\/sdk-browser test[\s\S]*?pnpm --filter @responsedock\/sdk-react test[\s\S]*?@responsedock\/sdk-browser package:check[\s\S]*?node scripts\/sdk-publish-preflight\.mjs[\s\S]*?grep -q '"workspace:'[\s\S]*?name: Publish to npm/,
    // A version already on npm is skipped, so a re-run after a partial failure is safe.
    /if on_npm "\$name@\$version"; then[\s\S]*?continue/,
    // sdk-react waits for the sdk-browser version it depends on.
    /if \[ "\$sdk" = "sdk-react" \]; then[\s\S]*?on_npm "@responsedock\/sdk-browser@\$dependency"[\s\S]*?npm publish/,
    /npm publish "\$tarball" --access public --provenance; then/,
    /NODE_AUTH_TOKEN: \$\{\{ secrets\.NPM_TOKEN \}\}/,
  ]);
  // Trusted publishing (OIDC) needs npm >= 11.5.1; the version is pinned exactly.
  const npmVersion = publish.match(/npm install --global npm@(\d+)\.(\d+)\.(\d+)\n/)?.slice(1).map(Number);
  assert.ok(npmVersion, 'the npm CLI version must be pinned');
  const [major, minor, patch] = npmVersion;
  assert.ok(major > 11 || (major === 11 && (minor > 5 || (minor === 5 && patch >= 1))), `npm ${npmVersion.join('.')} predates trusted publishing`);
  assert.doesNotMatch(publish, /^\s+(push|pull_request|pull_request_target|release|schedule|workflow_run):/m);
  assert.doesNotMatch(publish, /--provenance=(false|\$)/, 'the public repository always publishes with provenance');
  assert.doesNotMatch(publish, /working-directory: packages\//, 'publish packed tarballs, never workspace directories');
  assert.doesNotMatch(publish, /actions\/cache|setup-workspace/, 'the publish job must not restore a cache');
  // Package order: sdk-browser before sdk-react.
  assert.ok(publish.indexOf('"sdk-browser sdk-react"') > 0);
});

test('both SDKs are publishable public MIT packages of this repository', () => {
  for (const [name, manifest] of [['sdk-browser', browserPackage], ['sdk-react', reactPackage]]) {
    assert.equal(manifest.name, `@responsedock/${name}`);
    assert.equal(manifest.license, 'MIT');
    assert.deepEqual(manifest.repository, {
      type: 'git',
      url: 'git+https://github.com/ondrejstrnad/responsedock-sdk.git',
      directory: `packages/${name}`,
    });
    assert.deepEqual(manifest.publishConfig, { access: 'public', provenance: true });
    assert.equal(manifest.private, undefined);
  }
  assert.equal(reactPackage.dependencies['@responsedock/sdk-browser'], 'workspace:^');
  // sdk-browser is ESM-only, so sdk-react is too: no CommonJS entry that would require() it.
  for (const manifest of [browserPackage, reactPackage]) {
    assert.equal(manifest.type, 'module');
    assert.equal(manifest.exports['.'].import, './dist/index.js');
    assert.equal(manifest.exports['.'].require, undefined);
  }
  assert.equal(changesetConfig.access, 'public');
  assert.equal(changesetConfig.baseBranch, 'main');
  assert.deepEqual(changesetConfig.linked, [['@responsedock/sdk-browser', '@responsedock/sdk-react']]);
});

test('third-party actions are pinned to full commit SHAs', async () => {
  const workflows = await readdir(new URL('../.github/workflows/', import.meta.url));
  const sources = [setupWorkspace, ...(await Promise.all(workflows.map((file) => read(`.github/workflows/${file}`))))];
  let checked = 0;
  for (const source of sources) {
    for (const match of source.matchAll(/uses:\s+([^@\s]+)@([^\s#]+)/g)) {
      assert.match(match[2], /^[0-9a-f]{40}$/, `${match[1]} must use a full commit SHA`);
      checked += 1;
    }
  }
  assert.ok(checked > 0);
});

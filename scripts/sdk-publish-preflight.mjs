// Packs both SDKs exactly as they will be published and proves the tarballs install and import together
// in a clean React consumer project. Run after both SDKs are built (`pnpm build`).
//
//   node scripts/sdk-publish-preflight.mjs --out <dir>
//
// Writes <dir>/sdk-browser.tgz and <dir>/sdk-react.tgz. In GitHub Actions it also sets the step outputs
// `sdk-browser` and `sdk-react` to the tarball paths.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const repositoryUrl = 'git+https://github.com/ondrejstrnad/responsedock-sdk.git';
const sdks = ['sdk-browser', 'sdk-react'];

const { values } = parseArgs({ options: { out: { type: 'string' } } });
assert.ok(values.out, '--out <dir> is required');
const out = resolve(values.out);

const scratch = mkdtempSync(resolve(tmpdir(), 'responsedock-sdk-publish-'));
const env = { ...process.env, npm_config_cache: resolve(scratch, 'npm-cache') };

function run(command, args, cwd = root) {
  return execFileSync(command, args, { cwd, encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'inherit'] });
}

function pack(sdk) {
  const packageDir = resolve(root, 'packages', sdk);
  const source = JSON.parse(readFileSync(resolve(packageDir, 'package.json'), 'utf8'));
  // pnpm pack (unlike npm pack) rewrites workspace: dependency ranges to real versions.
  const packed = run('pnpm', ['pack', '--pack-destination', scratch], packageDir).trim().split('\n').pop();
  const tarball = resolve(out, `${sdk}.tgz`);
  copyFileSync(packed, tarball);
  const manifest = JSON.parse(run('tar', ['-xOzf', tarball, 'package/package.json']));
  const files = run('tar', ['-tzf', tarball]).trim().split('\n').map((path) => path.replace(/^package\//, ''));
  return { sdk, source, manifest, files: new Set(files), tarball };
}

function check({ sdk, source, manifest, files }) {
  assert.equal(manifest.name, `@responsedock/${sdk}`);
  assert.equal(manifest.version, source.version, `${sdk} packed version differs from package.json`);
  // npm provenance only verifies when repository.url names the repository that runs the publish workflow.
  assert.equal(manifest.repository?.url, repositoryUrl, `${sdk} repository.url must match the publishing repository`);
  assert.equal(manifest.repository?.directory, `packages/${sdk}`, `${sdk} repository.directory is wrong`);
  assert.equal(manifest.license, 'MIT', `${sdk} must be MIT licensed`);
  assert.deepEqual(manifest.publishConfig, { access: 'public', provenance: true }, `${sdk} publishConfig must be public with provenance`);
  for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const [name, range] of Object.entries(manifest[field] ?? {})) {
      assert.ok(!String(range).startsWith('workspace:'), `${sdk} still has ${field}.${name}: ${range}`);
    }
  }
  for (const required of ['package.json', 'LICENSE', 'README.md', 'CHANGELOG.md', 'dist/index.js', 'dist/index.d.ts']) {
    assert.ok(files.has(required), `${sdk} package is missing ${required}`);
  }
  assert.ok([...files].every((path) => !path.endsWith('.map')), `${sdk} must not ship source maps`);
  assert.ok([...files].every((path) => !path.startsWith('src/') && !path.startsWith('test/')), `${sdk} must ship only build output`);
}

try {
  mkdirSync(out, { recursive: true });
  const [browser, react] = sdks.map(pack);
  check(browser);
  check(react);

  assert.deepEqual(Object.keys(react.manifest.dependencies ?? {}), ['@responsedock/sdk-browser'], 'sdk-react may only depend on published SDK packages');
  assert.ok(
    [browser.manifest.version, `^${browser.manifest.version}`].includes(react.manifest.dependencies['@responsedock/sdk-browser']),
    `sdk-react must depend on @responsedock/sdk-browser ${browser.manifest.version}`,
  );

  const consumer = resolve(scratch, 'consumer');
  mkdirSync(consumer);
  writeFileSync(resolve(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', browser.tarball, react.tarball, 'react@^19', 'react-dom@^19'], consumer);
  const smoke = run('node', [
    '--input-type=module',
    '--eval',
    [
      "import { ResponseDock } from '@responsedock/sdk-browser';",
      "import { ResponseDock as Reexported, SurveyEmbed, SurveyModal, SurveyProvider, useSurvey } from '@responsedock/sdk-react';",
      "import { createElement } from 'react';",
      "import { renderToString } from 'react-dom/server';",
      "if (Reexported !== ResponseDock) throw new Error('sdk-react resolved a second copy of sdk-browser');",
      "for (const fn of [SurveyEmbed, SurveyModal, SurveyProvider, useSurvey]) if (typeof fn !== 'function') throw new Error('missing React export');",
      "console.log(renderToString(createElement(SurveyProvider, { projectKey: 'pk_test_package' }, 'ok')));",
    ].join('\n'),
  ], consumer).trim();
  assert.equal(smoke, 'ok');

  if (process.env.GITHUB_OUTPUT) {
    writeFileSync(process.env.GITHUB_OUTPUT, `sdk-browser=${browser.tarball}\nsdk-react=${react.tarball}\n`, { flag: 'a' });
  }
  for (const { manifest, tarball } of [browser, react]) console.log(`${manifest.name}@${manifest.version} -> ${tarball}`);
  console.log('SDK publish preflight passed: tarballs install and import together in a clean React project.');
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

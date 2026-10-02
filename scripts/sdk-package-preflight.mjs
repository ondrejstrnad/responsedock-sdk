import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const packageDir = resolve(root, 'packages/sdk-browser');
const scratch = mkdtempSync(resolve(tmpdir(), 'responsedock-sdk-package-'));
const cache = resolve(scratch, 'npm-cache');

function run(command, args, cwd = root) {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, npm_config_cache: cache },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

try {
  const metadata = JSON.parse(run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', scratch], packageDir));
  const packed = metadata[0];
  assert.ok(packed, 'npm pack did not return package metadata');

  const paths = new Set(packed.files.map((file) => file.path));
  for (const required of ['LICENSE', 'README.md', 'CHANGELOG.md', 'package.json', 'dist/index.js', 'dist/index.d.ts']) {
    assert.ok(paths.has(required), `package is missing ${required}`);
  }
  assert.ok([...paths].every((path) => !path.endsWith('.map')), 'source maps must not ship in the public package');
  assert.ok(packed.size < 20_000, `package tarball is unexpectedly large (${packed.size} bytes)`);

  const manifest = JSON.parse(readFileSync(resolve(packageDir, 'package.json'), 'utf8'));
  assert.equal(manifest.type, 'module');
  assert.deepEqual(manifest.dependencies ?? {}, {});
  assert.equal(manifest.exports['.'].require, undefined);

  writeFileSync(resolve(scratch, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', resolve(scratch, packed.filename)], scratch);
  const smoke = run('node', [
    '--input-type=module',
    '--eval',
    "import { ResponseDock } from '@responsedock/sdk-browser'; ResponseDock.init({ projectKey: 'pk_test_package' }); ResponseDock.reset(); console.log(typeof ResponseDock.embed);",
  ], scratch).trim();
  assert.equal(smoke, 'function');

  console.log(`SDK package preflight passed: ${packed.id}, ${packed.size} bytes, clean ESM consumer import.`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

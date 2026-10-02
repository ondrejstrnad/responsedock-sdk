import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { ResponseDock } from '../dist/index.js';

test('publishes the documented browser SDK surface', () => {
  for (const method of ['init', 'identify', 'track', 'show', 'embed', 'updateTheme', 'reset']) {
    assert.equal(typeof ResponseDock[method], 'function', `${method} must be exported`);
  }
});

test('can initialize and reset without accessing browser globals', () => {
  ResponseDock.init({ projectKey: 'pk_test_package' });
  ResponseDock.identify({ externalUserId: 'package-test-user' });
  assert.doesNotThrow(() => ResponseDock.reset());
});

test('publishes without private workspace dependencies', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const declarations = await readFile(new URL('../dist/types.d.ts', import.meta.url), 'utf8');

  assert.deepEqual(packageJson.dependencies ?? {}, {});
  assert.equal(packageJson.type, 'module');
  assert.equal(packageJson.exports['.'].require, undefined);
  assert.doesNotMatch(declarations, /@responsedock\//);
});

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ResponseDock,
  SurveyEmbed,
  SurveyModal,
  SurveyProvider,
  useSurvey,
} from '../dist/index.js';

test('publishes the documented React SDK surface', () => {
  assert.equal(typeof ResponseDock.init, 'function');
  assert.equal(typeof SurveyEmbed, 'function');
  assert.equal(typeof SurveyModal, 'function');
  assert.equal(typeof SurveyProvider, 'function');
  assert.equal(typeof useSurvey, 'function');
});

test('ships an ESM build marked as a React client module', async () => {
  const { readFile, access } = await import('node:fs/promises');
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(manifest.type, 'module');
  assert.equal(manifest.license, 'MIT');
  assert.equal(manifest.exports['.'].import, './dist/index.js');
  // sdk-browser is ESM-only, so there is no CommonJS entry that could require() it.
  assert.equal(manifest.exports['.'].require, undefined);
  for (const file of ['../LICENSE', '../README.md']) await access(new URL(file, import.meta.url));

  for (const file of ['index.js', 'SurveyProvider.js', 'SurveyEmbed.js', 'SurveyModal.js', 'useSurvey.js']) {
    const source = await readFile(new URL(`../dist/${file}`, import.meta.url), 'utf8');
    assert.match(source, /^'use client';/, `${file} must start with the "use client" directive`);
    assert.doesNotMatch(source, /\brequire\(|exports\./, `${file} must be ESM`);
  }
});

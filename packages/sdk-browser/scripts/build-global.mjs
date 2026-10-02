// Emits dist/responsedock.global.js: a dependency-free IIFE build that exposes
// `window.ResponseDock` for plain <script> tags (CDN, CMS, tag managers).
// The SDK is a single module with type-only imports, so the tsc output can be
// wrapped directly; the assertions below fail the build if that ever changes.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

const dist = new URL('../dist/', import.meta.url);
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const source = readFileSync(new URL('ResponseDock.js', dist), 'utf8');

assert.doesNotMatch(source, /^\s*import\s/m, 'ResponseDock.js gained a runtime import; use a bundler for the global build');
const body = source.replace(/^export const ResponseDock\b/m, 'const ResponseDock');
assert.notEqual(body, source, 'ResponseDock export not found');
assert.doesNotMatch(body, /^\s*export\s/m, 'ResponseDock.js gained another export; update the global build');

writeFileSync(new URL('responsedock.global.js', dist), `/*! @responsedock/sdk-browser v${version} | MIT */
(function () {
'use strict';
${body.trim()}
if (typeof window !== 'undefined') window.ResponseDock = ResponseDock;
})();
`);

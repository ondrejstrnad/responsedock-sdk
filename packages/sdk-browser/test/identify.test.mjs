import assert from 'node:assert/strict';
import test from 'node:test';

import { installFakeDom } from './fake-dom.mjs';

const dom = installFakeDom();
const { ResponseDock } = await import('../dist/index.js');

const SURVEY_URL = 'https://survey.example';
const HASH = 'a'.repeat(64);

function launchContext() {
  const el = document.createElement('div');
  dom.body.appendChild(el);
  const controller = ResponseDock.embed('nps', el);
  controller.iframe.dispatch('load');
  const posted = controller.iframe.posted.find((entry) => entry.message.type === 'ResponseDock:survey:context');
  controller.destroy();
  assert.ok(posted, 'launch context posted to the frame');
  assert.equal(posted.target, SURVEY_URL);
  return posted.message.payload;
}

test.beforeEach(() => {
  ResponseDock.init({ projectKey: 'pk_test', surveyUrl: SURVEY_URL });
  ResponseDock.reset();
});

test('identify forwards userHash to the survey frame as externalUserIdHash', () => {
  ResponseDock.identify({ externalUserId: 'user-1', userHash: HASH, traits: { plan: 'pro' } });
  const payload = launchContext();
  assert.equal(payload.externalUserId, 'user-1');
  assert.equal(payload.externalUserIdHash, HASH);
});

test('identify without userHash sends no hash (and clears a previous one)', () => {
  ResponseDock.identify({ externalUserId: 'user-1', userHash: HASH });
  ResponseDock.identify({ externalUserId: 'user-2' });
  const payload = launchContext();
  assert.equal(payload.externalUserId, 'user-2');
  assert.equal('externalUserIdHash' in payload, false);
});

test('reset clears the identity and its hash', () => {
  ResponseDock.identify({ externalUserId: 'user-1', userHash: HASH });
  ResponseDock.reset();
  const payload = launchContext();
  assert.equal('externalUserId' in payload, false);
  assert.equal('externalUserIdHash' in payload, false);
});

test('a blank userHash is ignored', () => {
  ResponseDock.identify({ externalUserId: 'user-1', userHash: '   ' });
  assert.equal('externalUserIdHash' in launchContext(), false);
});

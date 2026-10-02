import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

import { installFakeDom } from '../../sdk-browser/test/fake-dom.mjs';

const dom = installFakeDom();
const { ResponseDock, SurveyProvider, useSurvey } = await import('../dist/index.js');

const HASH = 'b'.repeat(64);

function launchContext() {
  const el = document.createElement('div');
  dom.body.appendChild(el);
  const controller = ResponseDock.embed('nps', el);
  controller.iframe.dispatch('load');
  const posted = controller.iframe.posted.find((entry) => entry.message.type === 'ResponseDock:survey:context');
  controller.destroy();
  return posted.message.payload;
}

test('SurveyProvider identity prop applies externalUserId and userHash before children embed', () => {
  ResponseDock.reset();
  renderToString(createElement(
    SurveyProvider,
    { projectKey: 'pk_test', surveyUrl: 'https://survey.example', identity: { externalUserId: 'user-7', userHash: HASH } },
    null,
  ));
  const payload = launchContext();
  assert.equal(payload.externalUserId, 'user-7');
  assert.equal(payload.externalUserIdHash, HASH);
});

test('useSurvey().identify forwards userHash', () => {
  ResponseDock.reset();
  let ctx = null;
  function Probe() {
    ctx = useSurvey();
    return null;
  }
  renderToString(createElement(SurveyProvider, { projectKey: 'pk_test', surveyUrl: 'https://survey.example' }, createElement(Probe)));
  ctx.identify({ externalUserId: 'user-8', userHash: HASH });
  const payload = launchContext();
  assert.equal(payload.externalUserId, 'user-8');
  assert.equal(payload.externalUserIdHash, HASH);
});

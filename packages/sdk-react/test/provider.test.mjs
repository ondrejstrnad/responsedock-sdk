import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

import { installFakeDom } from '../../sdk-browser/test/fake-dom.mjs';

installFakeDom();
const { ResponseDock, SurveyProvider, useSurvey } = await import('../dist/index.js');

test('SurveyProvider initialises during render, before any child effect can embed', () => {
  let ctx = null;
  function Probe() {
    ctx = useSurvey();
    return null;
  }
  // renderToString runs no effects: the SDK must already be configured afterwards.
  renderToString(createElement(SurveyProvider, { projectKey: 'pk_test', surveyUrl: 'https://custom-survey.example' }, createElement(Probe)));
  const controller = ResponseDock.embed('nps', document.createElement('div'));
  assert.equal(new URL(controller.iframe.src).origin, 'https://custom-survey.example');
  controller.destroy();
  assert.equal(typeof ctx.show, 'function');
  assert.ok(ctx.configKey.includes('https://custom-survey.example'));
});

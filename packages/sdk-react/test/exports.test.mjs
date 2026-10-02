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

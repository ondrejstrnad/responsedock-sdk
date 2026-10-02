import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

import { installFakeDom } from './fake-dom.mjs';

const dom = installFakeDom();
const { ResponseDock } = await import('../dist/index.js');

const SURVEY_URL = 'https://survey.example';
ResponseDock.init({ projectKey: 'pk_test', surveyUrl: SURVEY_URL });

function container() {
  const el = document.createElement('div');
  dom.body.appendChild(el);
  return el;
}

test('inline embed: per-frame origin, rd_origin, title and readiness from the survey', () => {
  const events = [];
  const controller = ResponseDock.embed('acme/nps', container(), {
    title: 'Customer survey',
    onReady: (e) => events.push(['ready', e]),
    onComplete: (e) => events.push(['complete', e]),
  });
  const { iframe } = controller;
  const src = new URL(iframe.src);
  assert.equal(src.origin, SURVEY_URL);
  assert.equal(src.pathname, '/w/acme/s/nps');
  assert.equal(src.searchParams.get('rd_origin'), 'https://host.example');
  assert.equal(iframe.title, 'Customer survey');
  assert.equal(iframe.getAttribute('allow'), 'clipboard-write');

  // A load event alone (e.g. a 404 page) is not "ready".
  iframe.dispatch('load');
  assert.deepEqual(events, []);

  // Re-initialising with another survey host must not orphan the existing frame.
  ResponseDock.init({ projectKey: 'pk_test', surveyUrl: 'https://other.example' });
  dom.lifecycle(iframe, 'ready', {}, 'https://evil.example');
  assert.deepEqual(events, [], 'foreign origins are ignored');
  dom.lifecycle(iframe, 'ready');
  dom.lifecycle(iframe, 'completed', { responseId: 'resp_1' });
  dom.lifecycle(iframe, 'completed', { responseId: 'resp_1' });
  assert.deepEqual(events.map(([name]) => name), ['ready', 'complete']);
  assert.equal(events[1][1].responseId, 'resp_1');
  assert.ok(iframe.posted.some(({ target }) => target === SURVEY_URL), 'theme/context target the frame origin');

  ResponseDock.init({ projectKey: 'pk_test', surveyUrl: SURVEY_URL });
  controller.destroy();
});

test('inline embed: placeholder min-height only until the first resize, generous cap', () => {
  const sizes = [];
  const { iframe, destroy } = ResponseDock.embed('nps', container(), { minHeight: 500, onResize: (e) => sizes.push(e.height) });
  assert.equal(iframe.style.minHeight, '500px');
  dom.lifecycle(iframe, 'resize', { height: 731.4 });
  assert.equal(iframe.style.minHeight, '');
  assert.equal(iframe.style.height, '732px');
  dom.lifecycle(iframe, 'resize', { height: 40_000 });
  assert.equal(iframe.style.height, '40000px');
  dom.lifecycle(iframe, 'resize', { height: 'nope' });
  assert.deepEqual(sizes, [732, 40000]);
  destroy();
});

test('inline embed: step changes, errors, and load timeout', async () => {
  const errors = [];
  const steps = [];
  const { iframe, destroy } = ResponseDock.embed('nps', container(), {
    loadTimeoutMs: 10,
    onError: (e) => errors.push(e.code),
    onStepChange: (e) => steps.push([e.pageIndex, e.total]),
  });
  dom.lifecycle(iframe, 'step_changed', { pageIndex: 1, total: 3 });
  dom.lifecycle(iframe, 'error', { code: 'THEME_REJECTED', message: 'bad theme', recoverable: true });
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(steps, [[1, 3]]);
  assert.deepEqual(errors, ['THEME_REJECTED']);
  destroy();

  const late = ResponseDock.embed('nps', container(), { loadTimeoutMs: 10, onError: (e) => errors.push(e.code) });
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(errors, ['THEME_REJECTED', 'LOAD_TIMEOUT']);
  late.destroy();
});

test('inline embed: scroll requests only scroll when the target is off screen', () => {
  const { iframe, destroy } = ResponseDock.embed('nps', container(), { scrollOffset: 72 });
  iframe.rect = { top: -400, height: 2000 };
  dom.window.scrolls.length = 0;
  dom.lifecycle(iframe, 'scroll_request', { top: 500 }); // 100px from the top: visible
  assert.equal(dom.window.scrolls.length, 0);
  dom.lifecycle(iframe, 'scroll_request', { top: 300 }); // above the sticky header
  assert.deepEqual(dom.window.scrolls, [{ top: 1000 - 100 - 72, behavior: 'smooth' }]);
  destroy();
});

test('redirect requests accept only http(s) and can be vetoed', () => {
  const seen = [];
  let veto = true;
  const { iframe, destroy } = ResponseDock.embed('nps', container(), {
    onRedirect: (e) => { seen.push(e.url); return veto ? false : undefined; },
  });
  dom.lifecycle(iframe, 'redirect_requested', { url: 'javascript:alert(1)' });
  dom.lifecycle(iframe, 'redirect_requested', { url: 'https://shop.example/thanks' });
  assert.deepEqual(seen, ['https://shop.example/thanks']);
  assert.deepEqual(dom.window.location.assigned, []);
  veto = false;
  dom.lifecycle(iframe, 'redirect_requested', { url: 'https://shop.example/thanks' });
  assert.deepEqual(dom.window.location.assigned, ['https://shop.example/thanks']);
  destroy();
});

test('modal: stays open after completion, closes on request, restores host state', () => {
  const calls = [];
  const opener = document.createElement('button');
  dom.body.appendChild(opener);
  opener.focus();
  dom.body.style.overflow = 'scroll';
  const baseline = dom.window.count('message');

  const controller = ResponseDock.show('nps', {
    onComplete: (e) => calls.push(['complete', e.responseId]),
    onDismiss: (e) => calls.push(['dismiss', e.reason]),
    onClose: (e) => calls.push(['close', e.reason, e.completed]),
  });
  const overlay = document.querySelector('#__ResponseDock_overlay__');
  const dialog = overlay.children.find((child) => child.getAttribute('role') === 'dialog');
  assert.equal(dialog.getAttribute('aria-modal'), 'true');
  assert.equal(dom.body.style.overflow, 'hidden');
  assert.equal(dom.body.style.paddingRight, '15px', 'scrollbar width is compensated');
  assert.equal(document.activeElement.getAttribute('aria-label'), 'Close survey');
  assert.ok(new URL(controller.iframe.src).searchParams.get('rd_origin'));

  // Tall content is capped to the modal, the frame scrolls internally.
  dom.lifecycle(controller.iframe, 'resize', { height: 5000 });
  assert.equal(controller.iframe.style.height, `${Math.floor(800 * 0.9 - 44)}px`);

  dom.lifecycle(controller.iframe, 'completed', { responseId: 'resp_9' });
  assert.ok(overlay.isConnected, 'thank-you screen remains visible');
  dom.lifecycle(controller.iframe, 'close_requested');
  assert.equal(overlay.isConnected, false);
  assert.deepEqual(calls, [['complete', 'resp_9'], ['close', 'frame', true]]);
  assert.equal(dom.body.style.overflow, 'scroll');
  assert.ok(!dom.body.style.paddingRight, 'padding restored');
  assert.equal(document.activeElement, opener);
  assert.equal(dom.window.count('message'), baseline);
});

test('modal: Escape dismisses; re-showing tears down the previous modal', () => {
  const calls = [];
  const baseline = dom.window.count('message');
  const first = ResponseDock.show('one', { onClose: (e) => calls.push(['first', e.reason]) });
  const second = ResponseDock.show('two', { onDismiss: (e) => calls.push(['dismiss', e.reason]) });
  assert.equal(first.iframe.isConnected, false);
  assert.equal(dom.window.count('message'), baseline + 1, 'previous listener removed');
  dom.document.dispatch('keydown', { key: 'Escape' });
  assert.equal(second.iframe.isConnected, false);
  assert.deepEqual(calls, [['dismiss', 'escape']], 'destroy() is silent; Escape dismisses');
  assert.equal(dom.window.count('message'), baseline);
});

test('modal: autoCloseAfterMs closes after completion', async () => {
  const calls = [];
  const controller = ResponseDock.show('nps', { autoCloseAfterMs: 5, onClose: (e) => calls.push([e.reason, e.completed]) });
  dom.lifecycle(controller.iframe, 'completed', { responseId: null });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(calls, [['auto', true]]);
});

test('global build exposes window.ResponseDock', async () => {
  const code = await readFile(new URL('../dist/responsedock.global.js', import.meta.url), 'utf8');
  const sandbox = { window: {}, console };
  vm.runInNewContext(code, sandbox);
  for (const method of ['init', 'identify', 'track', 'show', 'embed', 'updateTheme', 'reset']) {
    assert.equal(typeof sandbox.window.ResponseDock[method], 'function');
  }
});

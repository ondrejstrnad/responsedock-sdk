import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

import { installFakeDom } from './fake-dom.mjs';

const dom = installFakeDom();

// localStorage shim the tests can break on purpose.
const store = new Map();
let storageBroken = false;
dom.window.localStorage = {
  getItem: (key) => { if (storageBroken) throw new Error('blocked'); return store.get(key) ?? null; },
  setItem: (key, value) => { if (storageBroken) throw new Error('blocked'); store.set(key, String(value)); },
  removeItem: (key) => { if (storageBroken) throw new Error('blocked'); store.delete(key); },
};

// Minimal History API that updates location like a browser would.
const history = {
  pushState(_state, _title, url) { dom.window.location.pathname = new URL(url, 'https://host.example').pathname; },
  replaceState(_state, _title, url) { dom.window.location.pathname = new URL(url, 'https://host.example').pathname; },
};
const nativePushState = history.pushState;
dom.window.history = history;
dom.window.location.search = '';
// A desktop with a mouse (exit intent is desktop-only).
dom.window.matchMedia = (query) => ({ matches: query === '(pointer: fine)' });
dom.window.location.hash = '';

const sent = [];
let nextSurveys = [];
globalThis.fetch = async (url, init) => {
  sent.push({ url, body: JSON.parse(init.body) });
  const surveys = nextSurveys;
  nextSurveys = [];
  return { ok: true, json: async () => ({ surveys }) };
};

const { ResponseDock } = await import('../dist/index.js');
const SURVEY_URL = 'https://survey.example';
const flush = () => new Promise((resolve) => setImmediate(resolve));
const events = () => sent.map((entry) => entry.body.event);

test.beforeEach(() => {
  sent.length = 0;
  storageBroken = false;
  ResponseDock.init({ projectKey: 'pk_test', surveyUrl: SURVEY_URL });
  ResponseDock.reset();
});

test('anonymousId: generated once, persisted, sent with every event, renewed on reset()', async () => {
  await ResponseDock.track('signup');
  await ResponseDock.track('upgrade');
  const [first, second] = sent.map((entry) => entry.body.anonymousId);
  assert.match(first, /^anon_[a-f0-9]{32}$/);
  assert.equal(second, first);
  assert.equal(store.get('responsedock.anonymousId'), first);

  ResponseDock.reset();
  assert.equal(store.has('responsedock.anonymousId'), false, 'reset clears the persisted id');
  await ResponseDock.track('signup');
  assert.notEqual(sent[2].body.anonymousId, first);
});

test('anonymousId: survives a reload through localStorage and is sent alongside an identified user', async () => {
  // beforeEach reset() cleared memory, as on a fresh page load.
  store.set('responsedock.anonymousId', 'anon_persisted_123');
  ResponseDock.identify({ externalUserId: 'user-1' });
  await ResponseDock.track('signup');
  assert.equal(sent[0].body.anonymousId, 'anon_persisted_123');
  assert.equal(sent[0].body.externalUserId, 'user-1');
});

test('anonymousId: falls back to memory when storage throws', async () => {
  storageBroken = true;
  await ResponseDock.track('a');
  await ResponseDock.track('b');
  assert.match(sent[0].body.anonymousId, /^anon_/);
  assert.equal(sent[1].body.anonymousId, sent[0].body.anonymousId);
  assert.doesNotThrow(() => ResponseDock.reset());
});

test('anonymousId is part of the launch context sent to the survey frame', () => {
  const el = document.createElement('div');
  dom.body.appendChild(el);
  const controller = ResponseDock.embed('nps', el);
  controller.iframe.dispatch('load');
  const posted = controller.iframe.posted.find((entry) => entry.message.type === 'ResponseDock:survey:context');
  assert.match(posted.message.payload.anonymousId, /^anon_/);
  assert.equal(new URL(controller.iframe.src).searchParams.get('rd_mode'), 'embed');
  controller.destroy();
});

test('autoTrack: page views on load and SPA navigation, scroll depth, exit intent, delays', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    dom.window.location.pathname = '/home';
    dom.document.documentElement.scrollHeight = 2800; // 2000px scrollable at innerHeight 800
    dom.window.scrollY = 0;
    ResponseDock.init({
      projectKey: 'pk_test',
      surveyUrl: SURVEY_URL,
      autoTrack: { pageViews: true, exitIntent: true, scrollDepth: [90, 50, 50, 500], delaySeconds: [30] },
    });
    ResponseDock.identify({ externalUserId: 'user-1' });
    assert.deepEqual(events(), [], 'first page view waits a tick so identify() is included');
    mock.timers.tick(0);
    await flush();
    assert.deepEqual(events(), ['$pageview']);
    assert.equal(sent[0].body.externalUserId, 'user-1');
    assert.equal(sent[0].body.properties.pagePath, '/home');

    // Scroll depth: each threshold once per page, invalid ones dropped.
    dom.window.scrollY = 1100; // 55%
    dom.window.dispatch('scroll');
    dom.window.dispatch('scroll');
    mock.timers.tick(150);
    await flush();
    dom.window.scrollY = 1900; // 95%
    dom.window.dispatch('scroll');
    mock.timers.tick(150);
    dom.window.dispatch('scroll');
    mock.timers.tick(150);
    await flush();
    const depths = sent.filter((entry) => entry.body.event === '$scroll_depth').map((entry) => entry.body.properties.depth);
    assert.deepEqual(depths, [50, 90]);

    // Exit intent: pointer leaving through the top, once per page; moves into children ignored.
    dom.document.dispatch('mouseout', { clientY: 10, relatedTarget: null });
    dom.document.dispatch('mouseout', { clientY: -2, relatedTarget: {} });
    dom.document.dispatch('mouseout', { clientY: -2, relatedTarget: null });
    dom.document.dispatch('mouseout', { clientY: -2, relatedTarget: null });
    await flush();
    assert.equal(events().filter((name) => name === '$exit_intent').length, 1);

    // Time on page.
    mock.timers.tick(30_000);
    await flush();
    const timed = sent.find((entry) => entry.body.event === '$time_on_page');
    assert.deepEqual(timed.body.properties.seconds, 30);

    // SPA navigation starts a new page: page view again, thresholds and timers reset.
    sent.length = 0;
    history.replaceState(null, '', '/home'); // same page: nothing
    mock.timers.tick(0);
    history.pushState(null, '', '/pricing');
    mock.timers.tick(0);
    await flush();
    assert.deepEqual(events(), ['$pageview']);
    assert.equal(sent[0].body.properties.pagePath, '/pricing');
    dom.window.dispatch('scroll');
    mock.timers.tick(150);
    dom.document.dispatch('mouseout', { clientY: -1, relatedTarget: null });
    mock.timers.tick(10_000);
    await flush();
    assert.deepEqual(events(), ['$pageview', '$scroll_depth', '$scroll_depth', '$exit_intent']);

    dom.window.dispatch('popstate');
    await flush();
    assert.equal(events().length, 4, 'popstate to the same URL is not a new page');

    // Re-initialising without autoTrack removes listeners and restores History.
    ResponseDock.init({ projectKey: 'pk_test', surveyUrl: SURVEY_URL });
    assert.equal(history.pushState, nativePushState);
    assert.equal(dom.window.count('scroll'), 0);
    assert.equal(dom.document.count('mouseout'), 0);
    sent.length = 0;
    mock.timers.tick(60_000);
    history.pushState(null, '', '/docs');
    mock.timers.tick(0);
    await flush();
    assert.deepEqual(events(), []);
  } finally {
    mock.timers.reset();
    dom.window.scrollY = 1000;
  }
});

test('a triggered survey never replaces one that is already open', async () => {
  const open = ResponseDock.show('first');
  const firstFrame = open.iframe;
  nextSurveys = [{ id: 's2', slug: 'second' }];
  await ResponseDock.track('$exit_intent');
  const overlay = document.querySelector('#__ResponseDock_overlay__');
  assert.ok(firstFrame.isConnected, 'the open survey stays');
  assert.equal(overlay.querySelectorAll('iframe').length, 1);
  open.destroy();
});

test('modal: Escape forwarded by the frame closes with reason "escape"; inline embeds ignore it', () => {
  const closes = [];
  const modal = ResponseDock.show('nps', { onClose: (e) => closes.push(e.reason) });
  assert.equal(new URL(modal.iframe.src).searchParams.get('rd_mode'), 'modal');
  dom.lifecycle(modal.iframe, 'close_requested', { reason: 'escape' });
  assert.deepEqual(closes, ['escape']);

  const dismissals = [];
  const el = document.createElement('div');
  dom.body.appendChild(el);
  const embed = ResponseDock.embed('nps', el, { onDismiss: (e) => dismissals.push(e.reason) });
  dom.lifecycle(embed.iframe, 'close_requested', { reason: 'escape' });
  assert.deepEqual(dismissals, []);
  dom.lifecycle(embed.iframe, 'close_requested', { reason: 'completed' });
  assert.deepEqual(dismissals, ['frame']);
  embed.destroy();
});

test('launcher: accessible floating button that opens the modal and gets focus back', () => {
  const closes = [];
  const launcher = ResponseDock.launcher({
    surveyId: 'acme/nps',
    label: 'Give feedback',
    position: 'bottom-left',
    theme: { primaryColor: '#111827', primaryTextColor: '#f9fafb' },
    onClose: (e) => closes.push(e.reason),
  });
  const { button } = launcher;
  assert.equal(button.tagName, 'BUTTON');
  assert.equal(button.type, 'button');
  assert.equal(button.isConnected, true);
  assert.equal(button.textContent, 'Give feedback');
  assert.equal(button.getAttribute('aria-label'), 'Give feedback');
  assert.equal(button.getAttribute('aria-haspopup'), 'dialog');
  assert.equal(button.getAttribute('aria-expanded'), 'false');
  assert.equal(button.style.left, '20px');
  assert.equal(button.style.right, undefined);
  assert.equal(button.style.background, '#111827');

  button.click();
  const overlay = document.querySelector('#__ResponseDock_overlay__');
  assert.ok(overlay, 'modal opened');
  assert.equal(new URL(overlay.querySelectorAll('iframe')[0].src).pathname, '/w/acme/s/nps');
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  assert.equal(document.activeElement.getAttribute('aria-label'), 'Close survey');

  dom.document.dispatch('keydown', { key: 'Escape' });
  assert.equal(overlay.isConnected, false);
  assert.deepEqual(closes, ['escape']);
  assert.equal(button.getAttribute('aria-expanded'), 'false');
  assert.equal(document.activeElement, button, 'focus returns to the launcher');

  const controller = launcher.open();
  launcher.destroy();
  assert.equal(button.isConnected, false);
  assert.equal(controller.iframe.isConnected, false, 'destroy also removes an open modal');
});

import type {
  EmbedTheme,
  SdkCallbacks,
  SdkCloseReason,
  SdkEmbedController,
  SdkEmbedOptions,
  SdkErrorCallbackEvent,
  SdkEventPayload,
  SdkFrameOptions,
  SdkIdentifyPayload,
  SdkInitOptions,
  SdkModalController,
  SdkShowOptions,
  SdkSurveyMode,
} from './types.js';

interface ResponseDockState {
  projectKey: string | null;
  environment: 'production' | 'staging' | 'development';
  apiUrl: string;
  surveyUrl: string;
  allowedContextKeys: Set<string>;
  debug: boolean;
  callbacks: SdkCallbacks;
  externalUserId: string | null;
  /** Host-computed HMAC of externalUserId (identity verification). */
  userHash: string | null;
  traits: Record<string, string | number | boolean | null>;
  lastEventName: string | null;
  lastEventProperties: Record<string, string | number | boolean | null>;
  lastEventContext: Record<string, string | number | boolean | null>;
  theme: EmbedTheme;
  /** Live survey frames and the origin each one was created with. */
  surveyFrames: Map<HTMLIFrameElement, string>;
}

const DEFAULT_API_URL = 'https://api.responsedock.com';
const DEFAULT_SURVEY_URL = 'https://survey.responsedock.com';
const DEFAULT_LOAD_TIMEOUT_MS = 15_000;
const DEFAULT_SCROLL_OFFSET = 16;
const DEFAULT_EMBED_MIN_HEIGHT = 400;
const MIN_FRAME_HEIGHT = 160;
const MAX_FRAME_HEIGHT = 100_000;
const MODAL_CHROME_HEIGHT = 44;
const MODAL_INITIAL_HEIGHT = 600;
const LIFECYCLE = 'responsedock.lifecycle.';

const state: ResponseDockState = {
  projectKey: null,
  environment: 'production',
  apiUrl: DEFAULT_API_URL,
  surveyUrl: DEFAULT_SURVEY_URL,
  allowedContextKeys: new Set(),
  debug: false,
  callbacks: {},
  externalUserId: null,
  userHash: null,
  traits: {},
  lastEventName: null,
  lastEventProperties: {},
  lastEventContext: {},
  theme: {},
  surveyFrames: new Map(),
};

let activeModal: SdkModalController | null = null;

function log(...args: unknown[]): void {
  if (state.debug) {
    console.warn('[ResponseDock]', ...args);
  }
}

function safeTelemetryUrl(value?: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, window.location.origin);
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function compactString(value?: string | null, max = 500): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function safeContextKey(key: string): boolean {
  return /^[a-zA-Z0-9_.:-]{1,80}$/.test(key);
}

/** Never let a host callback break the SDK's own bookkeeping. */
function safeCall<T>(fn: ((event: T) => unknown) | undefined, event: T): unknown {
  if (!fn) return undefined;
  try {
    return fn(event);
  } catch (err) {
    log('Callback threw:', err);
    return undefined;
  }
}

function notifyError(event: SdkErrorCallbackEvent, local?: SdkCallbacks): void {
  safeCall(local?.onError, event);
  safeCall(state.callbacks.onError, event);
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T | null> {
  if (!state.projectKey) {
    const message = 'ResponseDock not initialized. Call ResponseDock.init() first.';
    log(message);
    notifyError({ message, code: 'NOT_INITIALIZED' });
    return null;
  }
  try {
    const url = `${state.apiUrl}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-Project-Key': state.projectKey,
        ...(options.headers ?? {}),
      },
    });
    if (!res.ok) {
      const message = `Request failed: ${res.status} ${res.statusText}`;
      log(message);
      notifyError({ message, code: 'REQUEST_FAILED' });
      return null;
    }
    return res.json() as Promise<T>;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error';
    log('Network error:', err);
    notifyError({ message, code: 'NETWORK_ERROR' });
    return null;
  }
}

/**
 * Initialize the ResponseDock SDK.
 * Must be called before any other method.
 */
function init(options: SdkInitOptions): void {
  state.projectKey = options.projectKey;
  state.environment = options.environment ?? 'production';
  state.apiUrl = options.apiUrl ?? DEFAULT_API_URL;
  state.surveyUrl = options.surveyUrl ?? (options.apiUrl ? getSurveyBaseUrl(options.apiUrl) : DEFAULT_SURVEY_URL);
  state.allowedContextKeys = new Set((options.allowedContextKeys ?? []).filter(safeContextKey));
  state.debug = options.debug ?? false;
  state.callbacks = options.callbacks ?? {};
  state.theme = options.theme ?? {};
  log('Initialized', { projectKey: options.projectKey, environment: state.environment });
}

/**
 * Identify the current user. Pass `userHash` (computed by your backend with the workspace
 * identity verification secret) so the survey can trust `externalUserId`.
 */
function identify(payload: SdkIdentifyPayload): void {
  state.externalUserId = payload.externalUserId;
  // A hash belongs to exactly one externalUserId: identifying without one clears the previous hash.
  state.userHash = typeof payload.userHash === 'string' && payload.userHash.trim()
    ? payload.userHash.trim()
    : null;
  state.traits = payload.traits ?? {};
  log('Identified user:', payload.externalUserId);
}

function getPageProperties(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const pageUrl = safeTelemetryUrl(window.location.href);
  const referrer = safeTelemetryUrl(document.referrer);
  return {
    ...(pageUrl ? { pageUrl } : {}),
    pagePath: window.location.pathname,
    ...(compactString(document.title, 200) ? { pageTitle: compactString(document.title, 200)! } : {}),
    ...(referrer ? { referrer } : {}),
  };
}

function normaliseEnvironment(): 'PRODUCTION' | 'STAGING' | 'DEVELOPMENT' {
  if (state.environment === 'staging') return 'STAGING';
  if (state.environment === 'development') return 'DEVELOPMENT';
  return 'PRODUCTION';
}

function compactRecord(
  record?: Record<string, string | number | boolean | null> | null,
): Record<string, string | number | boolean | null> {
  if (!record) return {};
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  ) as Record<string, string | number | boolean | null>;
}

function allowedLaunchContext(
  record: Record<string, string | number | boolean | null>,
  prefix?: string,
): Record<string, string | number | boolean | null> {
  const entries: Array<[string, string | number | boolean | null]> = [];
  for (const [key, value] of Object.entries(record)) {
    const outputKey = prefix ? `${prefix}.${key}` : key;
    if (!safeContextKey(key) || !safeContextKey(outputKey)) continue;
    if (!state.allowedContextKeys.has(key) && !state.allowedContextKeys.has(outputKey)) continue;
    entries.push([outputKey, value]);
  }
  return Object.fromEntries(entries);
}

function buildLaunchPayload(): Record<string, unknown> {
  const page = getPageProperties();
  const context = compactRecord({
    ...(state.lastEventName ? { eventName: state.lastEventName } : {}),
    ...allowedLaunchContext(state.traits, 'trait'),
    ...allowedLaunchContext(state.lastEventProperties),
    ...allowedLaunchContext(state.lastEventContext),
  });

  return {
    ...(state.externalUserId ? { externalUserId: state.externalUserId } : {}),
    ...(state.externalUserId && state.userHash ? { externalUserIdHash: state.userHash } : {}),
    source: {
      channel: 'browser_sdk',
      pageUrl: page.pageUrl ?? null,
      referrer: page.referrer ?? null,
    },
    context,
  };
}

function originOf(url: string): string | null {
  try {
    return new URL(url, window.location.origin).origin;
  } catch {
    return null;
  }
}

function sendLaunchContext(iframe: HTMLIFrameElement, targetOrigin: string): void {
  iframe.contentWindow?.postMessage(
    { type: 'ResponseDock:survey:context', payload: buildLaunchPayload() },
    targetOrigin,
  );
}

function sendTheme(iframe: HTMLIFrameElement, targetOrigin: string): void {
  iframe.contentWindow?.postMessage({ type: 'responsedock.theme.update', theme: state.theme }, targetOrigin);
  iframe.contentWindow?.postMessage({
    protocol: 'responsedock.embed', version: 1, type: 'responsedock.command.theme.update', theme: state.theme,
  }, targetOrigin);
}

function updateTheme(theme: EmbedTheme): void {
  state.theme = { ...state.theme, ...theme };
  for (const [frame, origin] of state.surveyFrames) sendTheme(frame, origin);
}

function getSurveyBaseUrl(apiUrl: string = state.apiUrl): string {
  try {
    const url = new URL(apiUrl);
    url.pathname = url.pathname.replace(/\/api(?:\/v\d+)?\/?$/, '');
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return apiUrl.replace(/\/api(?:\/v\d+)?\/?$/, '').replace(/\/$/, '');
  }
}

/**
 * Track an event. The backend evaluates trigger rules and may return surveys to show.
 */
async function track(
  event: string,
  properties?: SdkEventPayload['properties'],
  context?: SdkEventPayload['context'],
): Promise<void> {
  const eventProperties = compactRecord({ ...getPageProperties(), ...(properties ?? {}) });
  const eventContext = compactRecord(context ?? {});
  state.lastEventName = event;
  state.lastEventProperties = eventProperties;
  state.lastEventContext = eventContext;

  const payload: SdkEventPayload & {
    externalUserId?: string;
    traits?: Record<string, unknown>;
    environment?: 'PRODUCTION' | 'STAGING' | 'DEVELOPMENT';
  } = {
    event,
    properties: eventProperties,
    context: eventContext,
    environment: normaliseEnvironment(),
    ...(state.externalUserId && {
      externalUserId: state.externalUserId,
      traits: state.traits,
    }),
  };

  const result = await request<{ surveys: Array<{ id: string; slug: string; workspaceSlug?: string }> }>(
    '/api/v1/sdk/events',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );

  if (result?.surveys?.length) {
    const [first] = result.surveys;
    if (first) {
      log('Trigger matched survey:', first.id);
      show(first.workspaceSlug ? `${first.workspaceSlug}/${first.slug ?? first.id}` : first.slug ?? first.id);
    }
  }
}

function boundedHeight(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.min(MAX_FRAME_HEIGHT, Math.max(MIN_FRAME_HEIGHT, Math.ceil(value)));
}

function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  } catch {
    return false;
  }
}

function viewportHeight(): number {
  return window.visualViewport?.height ?? window.innerHeight;
}

interface FrameHooks {
  /** A valid, bounded height reported by the frame. */
  onHeight: (height: number) => void;
  onCompleted?: () => void;
  onCloseRequested?: () => void;
  onScrollRequest?: (top: number) => void;
}

interface SurveyFrame {
  iframe: HTMLIFrameElement;
  teardown: () => void;
}

/**
 * Creates a survey iframe bound to the origin it was created with, and routes its
 * lifecycle messages. The origin is captured per frame, so a later init() with a
 * different surveyUrl never makes an existing frame's messages fail the origin check.
 */
function createSurveyFrame(
  surveyId: string,
  mode: SdkSurveyMode,
  options: SdkFrameOptions,
  hooks: FrameHooks,
): SurveyFrame {
  const src = buildSurveyUrl(surveyId);
  const origin = originOf(src) ?? '';
  const iframe = document.createElement('iframe');
  iframe.src = src;
  iframe.title = options.title ?? 'Survey';
  iframe.setAttribute('allow', 'clipboard-write');
  Object.assign(iframe.style, { display: 'block', width: '100%', border: '0' });

  const base = { surveyId, mode };
  let ready = false;
  let completed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let observer: IntersectionObserver | undefined;

  const error = (message: string, code?: string) => notifyError({ ...base, message, ...(code ? { code } : {}) }, options);
  const clearTimer = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    observer?.disconnect();
    observer = undefined;
  };
  const armTimer = () => {
    const ms = options.loadTimeoutMs ?? DEFAULT_LOAD_TIMEOUT_MS;
    if (!(ms > 0) || ready || timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      if (!ready) error(`Survey did not become ready within ${ms}ms.`, 'LOAD_TIMEOUT');
    }, ms);
  };
  const markReady = () => {
    sendLaunchContext(iframe, origin);
    sendTheme(iframe, origin);
    if (ready) return;
    ready = true;
    clearTimer();
    safeCall(options.onReady, base);
    safeCall(state.callbacks.onReady, base);
  };
  const complete = (responseId: unknown) => {
    if (completed) return;
    completed = true;
    const event = { ...base, responseId: typeof responseId === 'string' ? responseId : null };
    safeCall(options.onComplete, event);
    safeCall(state.callbacks.onComplete, event);
    hooks.onCompleted?.();
  };
  const redirect = (value: unknown) => {
    const url = safeHttpUrl(value);
    if (!url) return;
    const event = { ...base, url };
    const local = safeCall(options.onRedirect, event);
    const global = safeCall(state.callbacks.onRedirect, event);
    if (local === false || global === false) return;
    try {
      window.top!.location.assign(url);
    } catch {
      window.location.assign(url);
    }
  };

  const onMessage = (e: MessageEvent): void => {
    if (e.source !== iframe.contentWindow || e.origin !== origin) return;
    const data = e.data as { protocol?: unknown; version?: unknown; type?: unknown; payload?: Record<string, unknown>; surveyId?: unknown; responseId?: unknown } | null;
    if (!data || typeof data.type !== 'string') return;
    if (data.protocol === 'responsedock.embed' && data.version === 1) {
      const payload = data.payload ?? {};
      switch (data.type.startsWith(LIFECYCLE) ? data.type.slice(LIFECYCLE.length) : '') {
        case 'ready':
          markReady();
          break;
        case 'resize': {
          const height = boundedHeight(payload.height);
          if (height === null) break;
          hooks.onHeight(height);
          const event = { ...base, height: Math.ceil(payload.height as number) };
          safeCall(options.onResize, event);
          safeCall(state.callbacks.onResize, event);
          break;
        }
        case 'completed':
          complete(payload.responseId);
          break;
        case 'close_requested':
          hooks.onCloseRequested?.();
          break;
        case 'error':
          clearTimer();
          error(typeof payload.message === 'string' ? payload.message : 'Survey frame reported an error.',
            typeof payload.code === 'string' ? payload.code : undefined);
          break;
        case 'session_expired':
          error('The survey session expired.', 'SESSION_EXPIRED');
          break;
        case 'step_changed':
          if (typeof payload.pageIndex === 'number' && typeof payload.total === 'number') {
            const event = { ...base, pageIndex: payload.pageIndex, total: payload.total };
            safeCall(options.onStepChange, event);
            safeCall(state.callbacks.onStepChange, event);
          }
          break;
        case 'scroll_request':
          if (typeof payload.top === 'number' && Number.isFinite(payload.top)) hooks.onScrollRequest?.(payload.top);
          break;
        case 'redirect_requested':
          redirect(payload.url);
          break;
      }
      return;
    }
    // Legacy (pre-v1) survey frames.
    if (data.type === 'ResponseDock:survey:ready') markReady();
    if (data.type === 'responsedock.theme.ready') sendTheme(iframe, origin);
    if (data.type === 'ResponseDock:survey:completed') complete(data.responseId);
    if (data.type === 'ResponseDock:survey:closed') hooks.onCloseRequested?.();
  };

  // Branding goes out as early as possible to avoid a flash of the default theme.
  // Readiness is only reported once the survey itself says it loaded.
  iframe.addEventListener('load', () => {
    sendLaunchContext(iframe, origin);
    sendTheme(iframe, origin);
  });
  window.addEventListener('message', onMessage);
  state.surveyFrames.set(iframe, origin);

  if ((options as SdkEmbedOptions).loading === 'lazy' && typeof IntersectionObserver === 'function') {
    observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer?.disconnect();
        observer = undefined;
        armTimer();
      }
    });
    observer.observe(iframe);
  } else {
    armTimer();
  }

  return {
    iframe,
    teardown: () => {
      clearTimer();
      window.removeEventListener('message', onMessage);
      state.surveyFrames.delete(iframe);
      iframe.remove();
    },
  };
}

const NOOP_MODAL: SdkModalController = { iframe: null, close: () => undefined, destroy: () => undefined };

/**
 * Show a survey in an accessible modal overlay. Returns a controller to close or destroy it.
 * The thank-you screen stays visible after completion until the respondent closes the modal
 * (or `autoCloseAfterMs` elapses).
 */
function show(surveyIdOrSlug: string, options: SdkShowOptions = {}): SdkModalController {
  if (typeof document === 'undefined') return NOOP_MODAL;
  log('Showing survey:', surveyIdOrSlug);

  // Only one modal at a time; fully tear down the previous one (listeners included).
  activeModal?.destroy();

  const base = { surveyId: surveyIdOrSlug, mode: 'modal' as const };
  const theme = state.theme;
  const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  let contentHeight: number | null = null;
  let completed = false;
  let open = true;
  let autoCloseTimer: ReturnType<typeof setTimeout> | undefined;

  const overlay = document.createElement('div');
  overlay.id = '__ResponseDock_overlay__';
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
    boxSizing: 'border-box',
    overscrollBehavior: 'contain',
    zIndex: '2147483647',
    fontFamily: 'system-ui, sans-serif',
  });

  const modal = document.createElement('div');
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', options.title ?? 'Survey');
  Object.assign(modal.style, {
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: theme.surfaceColor ?? theme.backgroundColor ?? '#fff',
    borderRadius: '12px',
    width: '100%',
    maxWidth: '560px',
    maxHeight: '90vh',
    overflow: 'hidden',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
  });
  // Dynamic viewport units follow mobile browser toolbars; unsupported values are ignored.
  modal.style.maxHeight = '90dvh';

  const header = document.createElement('div');
  Object.assign(header.style, {
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'center',
    height: `${MODAL_CHROME_HEIGHT}px`,
    flex: '0 0 auto',
    padding: '0 4px',
  });
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', 'Close survey');
  closeButton.textContent = '×';
  Object.assign(closeButton.style, {
    width: '36px',
    height: '36px',
    border: '0',
    borderRadius: '8px',
    background: 'transparent',
    color: theme.textColor ?? '#334155',
    fontSize: '24px',
    lineHeight: '1',
    cursor: 'pointer',
  });
  header.appendChild(closeButton);

  // Focus sentinels keep keyboard focus inside the dialog (close button <-> survey frame).
  const sentinel = () => {
    const el = document.createElement('div');
    el.tabIndex = 0;
    el.setAttribute('aria-hidden', 'true');
    Object.assign(el.style, { position: 'fixed', width: '1px', height: '1px', overflow: 'hidden', opacity: '0' });
    return el;
  };
  const startSentinel = sentinel();
  const endSentinel = sentinel();

  const frame = createSurveyFrame(surveyIdOrSlug, 'modal', options, {
    onHeight: (height) => {
      contentHeight = height;
      fitFrame();
    },
    onCompleted: () => {
      completed = true;
      if (options.autoCloseAfterMs !== undefined && options.autoCloseAfterMs >= 0) {
        autoCloseTimer = setTimeout(() => close('auto'), options.autoCloseAfterMs);
      }
    },
    onCloseRequested: () => close('frame'),
  });
  const { iframe } = frame;
  iframe.style.flex = '0 0 auto';

  /** Never taller than the modal can show; beyond that the survey scrolls inside its frame. */
  function fitFrame(): void {
    const vh = viewportHeight();
    const available = Math.max(MIN_FRAME_HEIGHT, Math.min(vh * 0.9, vh - 32) - MODAL_CHROME_HEIGHT);
    iframe.style.height = `${Math.floor(Math.min(contentHeight ?? MODAL_INITIAL_HEIGHT, available))}px`;
  }

  // Lock host scrolling and keep the layout from shifting where the scrollbar was.
  const body = document.body;
  const lockedStyles = { overflow: body.style.overflow, paddingRight: body.style.paddingRight };
  const scrollbar = window.innerWidth - document.documentElement.clientWidth;
  body.style.overflow = 'hidden';
  if (scrollbar > 0) {
    const current = parseFloat(window.getComputedStyle(body).paddingRight) || 0;
    body.style.paddingRight = `${current + scrollbar}px`;
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' || e.key === 'Esc') {
      e.stopPropagation();
      close('escape');
    }
  };
  const onViewportResize = () => fitFrame();
  const focusFrame = () => iframe.focus();
  const focusClose = () => closeButton.focus();

  function teardown(): void {
    if (!open) return;
    open = false;
    if (autoCloseTimer !== undefined) clearTimeout(autoCloseTimer);
    frame.teardown();
    document.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('resize', onViewportResize);
    window.visualViewport?.removeEventListener('resize', onViewportResize);
    overlay.remove();
    body.style.overflow = lockedStyles.overflow;
    body.style.paddingRight = lockedStyles.paddingRight;
    if (activeModal === controller) activeModal = null;
    if (previouslyFocused?.isConnected) previouslyFocused.focus();
  }

  function close(reason: SdkCloseReason): void {
    if (!open) return;
    teardown();
    if (!completed) {
      safeCall(options.onDismiss, { ...base, reason });
      safeCall(state.callbacks.onDismiss, { ...base, reason });
    }
    safeCall(options.onClose, { ...base, reason, completed });
  }

  closeButton.addEventListener('click', () => close('close_button'));
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close('backdrop');
  });
  startSentinel.addEventListener('focus', focusFrame);
  endSentinel.addEventListener('focus', focusClose);
  document.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('resize', onViewportResize);
  window.visualViewport?.addEventListener('resize', onViewportResize);

  fitFrame();
  modal.append(header, iframe);
  overlay.append(startSentinel, modal, endSentinel);
  body.appendChild(overlay);
  closeButton.focus();

  const controller: SdkModalController = {
    iframe,
    close: () => close('api'),
    destroy: teardown,
  };
  activeModal = controller;
  return controller;
}

function cssLength(value: number | string): string {
  return typeof value === 'number' ? `${value}px` : value;
}

/**
 * Embed a survey inline into a container element. The frame grows and shrinks with
 * the survey, so the host page scrolls naturally.
 */
function embed(
  surveyIdOrSlug: string,
  container: HTMLElement | string,
  options: SdkEmbedOptions = {},
): SdkEmbedController | null {
  const el =
    typeof container === 'string'
      ? document.querySelector<HTMLElement>(container)
      : container;

  if (!el) {
    const message = 'Embed container not found.';
    log(message, container);
    notifyError({ message, code: 'CONTAINER_NOT_FOUND', surveyId: surveyIdOrSlug, mode: 'embed' }, options);
    return null;
  }

  const scrollOffset = options.scrollOffset ?? DEFAULT_SCROLL_OFFSET;
  const frame = createSurveyFrame(surveyIdOrSlug, 'embed', options, {
    onHeight: (height) => {
      // The placeholder only bridges the first paint; afterwards the survey decides.
      iframe.style.minHeight = '';
      iframe.style.height = `${height}px`;
    },
    onScrollRequest: (top) => {
      if (!iframe.isConnected) return;
      const target = iframe.getBoundingClientRect().top + top;
      const bottomLimit = viewportHeight() - Math.max(scrollOffset, 80);
      if (target >= scrollOffset && target <= bottomLimit) return;
      window.scrollTo({
        top: Math.max(0, window.scrollY + target - scrollOffset),
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      });
    },
    onCloseRequested: () => {
      const event = { surveyId: surveyIdOrSlug, mode: 'embed' as const, reason: 'frame' as const };
      safeCall(options.onDismiss, event);
      safeCall(state.callbacks.onDismiss, event);
    },
  });
  const { iframe } = frame;
  iframe.style.height = '100%';
  iframe.style.minHeight = cssLength(options.minHeight ?? DEFAULT_EMBED_MIN_HEIGHT);
  if (options.loading) iframe.setAttribute('loading', options.loading);

  el.appendChild(iframe);
  log('Embedded survey:', surveyIdOrSlug);

  return {
    iframe,
    destroy: frame.teardown,
  };
}

function buildSurveyUrl(surveyIdOrSlug: string): string {
  const base = state.surveyUrl.replace(/\/$/, '');
  const params = new URLSearchParams({ rd_sdk: '1' });
  // Lets the survey address the host even when the host sends no referrer.
  const hostOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  if (hostOrigin && hostOrigin !== 'null') params.set('rd_origin', hostOrigin);
  const [workspaceSlug, surveySlug] = surveyIdOrSlug.includes('/')
    ? surveyIdOrSlug.split('/', 2)
    : [null, surveyIdOrSlug];
  const path = workspaceSlug
    ? `/w/${encodeURIComponent(workspaceSlug)}/s/${encodeURIComponent(surveySlug ?? '')}`
    : `/s/${encodeURIComponent(surveySlug ?? '')}`;
  return `${base}${path}?${params.toString()}`;
}

/**
 * Reset the SDK state (useful for testing or logout).
 */
function reset(): void {
  state.externalUserId = null;
  state.userHash = null;
  state.traits = {};
  state.lastEventName = null;
  state.lastEventProperties = {};
  state.lastEventContext = {};
  state.theme = {};
  log('State reset');
}

export const ResponseDock = {
  init,
  identify,
  track,
  show,
  embed,
  updateTheme,
  reset,
} as const;

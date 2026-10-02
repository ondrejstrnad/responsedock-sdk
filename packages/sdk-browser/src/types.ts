/** Branding tokens accepted from a trusted embedding host. */
export interface EmbedTheme {
  primaryColor?: string;
  primaryTextColor?: string;
  secondaryColor?: string;
  backgroundColor?: string;
  surfaceColor?: string;
  textColor?: string;
  mutedColor?: string;
  borderColor?: string;
  errorColor?: string;
  fontFamily?: string;
  /** Optional HTTPS font file loaded inside cross-origin embed frames. */
  fontUrl?: string;
  borderRadius?: number | string;
  buttonStyle?: 'rounded' | 'square' | 'pill';
  optionStyle?: 'bordered' | 'minimal' | 'pill';
  cardShadow?: 'none' | 'subtle' | 'elevated';
  logoUrl?: string;
  brandName?: string;
  hidePlatformBranding?: boolean;
  questionSize?: 'small' | 'medium' | 'large';
  surveyWidth?: 'narrow' | 'standard' | 'wide';
}

export type SdkSurveyMode = 'modal' | 'embed';

/** Handle returned by an inline embed. Call destroy when the host removes the view. */
export interface SdkEmbedController {
  readonly iframe: HTMLIFrameElement;
  destroy: () => void;
}

/** Handle returned by `ResponseDock.show()`. */
export interface SdkModalController {
  /** The survey frame, or null when no document is available (SSR). */
  readonly iframe: HTMLIFrameElement | null;
  /** Close the modal as if the host dismissed it (fires onDismiss/onClose with reason `api`). */
  close: () => void;
  /** Remove the modal silently, without firing callbacks. */
  destroy: () => void;
}

export interface SdkSurveyCallbackEvent {
  surveyId: string;
  mode: SdkSurveyMode;
}

export interface SdkCompleteEvent extends SdkSurveyCallbackEvent {
  /** Id of the stored response, when the survey frame reports it. */
  responseId: string | null;
}

/**
 * Why a survey was closed:
 * `close_button` (the modal X), `escape`, `backdrop` (overlay click), `frame` (the survey asked to close),
 * `api` (controller.close() / React `open={false}`), `auto` (autoCloseAfterMs elapsed after completion).
 */
export type SdkCloseReason = 'close_button' | 'escape' | 'backdrop' | 'frame' | 'api' | 'auto';

export interface SdkDismissEvent extends SdkSurveyCallbackEvent {
  reason: SdkCloseReason;
}

export interface SdkCloseEvent extends SdkDismissEvent {
  /** True when the respondent finished the survey before the modal closed. */
  completed: boolean;
}

export interface SdkErrorCallbackEvent {
  message: string;
  /** Machine-readable code, e.g. `LOAD_TIMEOUT`, `THEME_REJECTED`, `SESSION_EXPIRED`, `CONTAINER_NOT_FOUND`. */
  code?: string;
  surveyId?: string;
  mode?: SdkSurveyMode;
}

export interface SdkResizeEvent extends SdkSurveyCallbackEvent {
  /** Content height reported by the survey frame, in CSS pixels. */
  height: number;
}

export interface SdkStepChangeEvent extends SdkSurveyCallbackEvent {
  /** Zero-based index of the page now shown. */
  pageIndex: number;
  total: number;
}

export interface SdkRedirectEvent extends SdkSurveyCallbackEvent {
  /** Validated http(s) URL the survey wants to open in the top window. */
  url: string;
}

export interface SdkCallbacks {
  /** The survey frame loaded the survey and is ready (not fired for frames that fail to load). */
  onReady?: (event: SdkSurveyCallbackEvent) => void;
  onComplete?: (event: SdkCompleteEvent) => void;
  /** The survey was closed before completion. */
  onDismiss?: (event: SdkDismissEvent) => void;
  onError?: (event: SdkErrorCallbackEvent) => void;
  onResize?: (event: SdkResizeEvent) => void;
  onStepChange?: (event: SdkStepChangeEvent) => void;
  /** Return `false` to handle the redirect yourself; otherwise the SDK navigates the top window. */
  onRedirect?: (event: SdkRedirectEvent) => boolean | void;
}

/** Options shared by inline embeds and modals. Callbacks here fire in addition to the init() callbacks. */
export interface SdkFrameOptions extends SdkCallbacks {
  /** Accessible iframe title. Default `"Survey"`. */
  title?: string;
  /** Raise onError({ code: 'LOAD_TIMEOUT' }) when the survey is not ready in time. Default 15000; 0 disables. */
  loadTimeoutMs?: number;
}

export interface SdkEmbedOptions extends SdkFrameOptions {
  /** Placeholder height used only until the first resize from the survey. Default 400 (px when a number). */
  minHeight?: number | string;
  /** Native iframe loading strategy. The load timeout starts when a lazy frame scrolls into view. */
  loading?: 'eager' | 'lazy';
  /** Space kept above a scrolled-to question, e.g. the height of a sticky header. Default 16 (px). */
  scrollOffset?: number;
}

export interface SdkShowOptions extends SdkFrameOptions {
  /** Close the modal this many ms after completion. By default the thank-you screen stays until dismissed. */
  autoCloseAfterMs?: number;
  /** Fired once whenever the modal closes, for any reason (not on destroy()). */
  onClose?: (event: SdkCloseEvent) => void;
}

export interface SdkInitOptions {
  projectKey: string;
  environment?: 'production' | 'staging' | 'development';
  apiUrl?: string;
  surveyUrl?: string;
  allowedContextKeys?: string[];
  debug?: boolean;
  callbacks?: SdkCallbacks;
  /** Host branding forwarded securely to the cross-origin survey frame. */
  theme?: EmbedTheme;
}

export interface SdkIdentifyPayload {
  externalUserId: string;
  traits?: Record<string, string | number | boolean | null>;
  /**
   * Identity verification hash computed by your backend:
   * `hex(HMAC-SHA256(workspaceIdentitySecret, externalUserId))`. Required when the workspace
   * enforces identity verification; never compute it in the browser (the secret must stay server-side).
   */
  userHash?: string;
}

export interface SdkEventPayload {
  event: string;
  properties?: Record<string, string | number | boolean | null>;
  context?: Record<string, string | number | boolean | null>;
}

'use client';

import { createContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { ResponseDock } from '@responsedock/sdk-browser';
import type { SdkCallbacks, SdkIdentifyPayload, SdkInitOptions, SdkModalController, SdkShowOptions } from '@responsedock/sdk-browser';

export interface SurveyContextValue {
  track: (event: string, properties?: Record<string, string | number | boolean | null>) => Promise<void>;
  show: (surveyIdOrSlug: string, options?: SdkShowOptions) => SdkModalController;
  identify: (payload: SdkIdentifyPayload) => void;
  /** Changes whenever the SDK is re-initialised with a different project or host. */
  configKey: string;
}

export const SurveyContext = createContext<SurveyContextValue | null>(null);

interface SurveyProviderProps extends SdkInitOptions {
  children: ReactNode;
  /**
   * The signed-in user, applied before any child survey loads. Include `userHash` (computed by your
   * backend) when the workspace uses identity verification. Setting it back to null clears the identity.
   */
  identity?: SdkIdentifyPayload | null;
}

const CALLBACK_NAMES = ['onReady', 'onComplete', 'onDismiss', 'onError', 'onResize', 'onStepChange', 'onRedirect'] as const;

export function SurveyProvider({ children, identity, ...initOptions }: SurveyProviderProps) {
  // Callbacks live in a ref so they are never stale and never force a re-init.
  const callbacksRef = useRef<SdkCallbacks | undefined>(initOptions.callbacks);
  callbacksRef.current = initOptions.callbacks;
  const stableCallbacks = useMemo<SdkCallbacks>(() => {
    const callbacks: Record<string, (event: never) => unknown> = {};
    for (const name of CALLBACK_NAMES) {
      callbacks[name] = (event: never) => (callbacksRef.current?.[name] as ((e: never) => unknown) | undefined)?.(event);
    }
    return callbacks as SdkCallbacks;
  }, []);

  const { projectKey, apiUrl, surveyUrl, environment, debug, theme, autoTrack } = initOptions;
  const contextKeys = (initOptions.allowedContextKeys ?? []).join('\u0000');
  const themeKey = JSON.stringify(theme ?? {});
  const autoTrackKey = JSON.stringify(autoTrack ?? null);
  const configKey = [projectKey, apiUrl ?? '', surveyUrl ?? '', environment ?? '', debug ? '1' : '0', contextKeys, autoTrackKey].join('|');

  // Initialise synchronously during render: child effects (e.g. <SurveyEmbed>) run
  // before this component's effects, so an effect here would be too late.
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const initialisedKey = useRef<string | null>(null);
  if (initialisedKey.current !== configKey) {
    initialisedKey.current = configKey;
    ResponseDock.init({
      projectKey,
      ...(apiUrl !== undefined ? { apiUrl } : {}),
      ...(surveyUrl !== undefined ? { surveyUrl } : {}),
      ...(environment !== undefined ? { environment } : {}),
      ...(debug !== undefined ? { debug } : {}),
      allowedContextKeys: contextKeys ? contextKeys.split('\u0000') : [],
      callbacks: stableCallbacks,
      ...(themeRef.current ? { theme: themeRef.current } : {}),
      ...(autoTrack !== undefined ? { autoTrack } : {}),
    });
  }

  // Identify during render too, so the first launch context already carries the identity.
  const identityKey = identity
    ? JSON.stringify([identity.externalUserId, identity.userHash ?? null, identity.traits ?? {}])
    : null;
  const appliedIdentityKey = useRef<string | null>(null);
  if (appliedIdentityKey.current !== identityKey) {
    const hadIdentity = appliedIdentityKey.current !== null;
    appliedIdentityKey.current = identityKey;
    if (identity) {
      ResponseDock.identify(identity);
    } else if (hadIdentity) {
      ResponseDock.reset();
      if (themeRef.current) ResponseDock.updateTheme(themeRef.current);
    }
  }

  const firstTheme = useRef(true);
  useEffect(() => {
    if (firstTheme.current) {
      firstTheme.current = false;
      return;
    }
    if (themeRef.current) ResponseDock.updateTheme(themeRef.current);
  }, [themeKey]);

  const value = useMemo<SurveyContextValue>(() => ({
    track: (event, properties) => ResponseDock.track(event, properties),
    show: (surveyIdOrSlug, options) => ResponseDock.show(surveyIdOrSlug, options),
    identify: (payload) => ResponseDock.identify(payload),
    configKey,
  }), [configKey]);

  return <SurveyContext.Provider value={value}>{children}</SurveyContext.Provider>;
}

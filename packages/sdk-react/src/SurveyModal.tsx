'use client';

import { useEffect, useRef } from 'react';
import { ResponseDock } from '@responsedock/sdk-browser';
import type { SdkCloseEvent, SdkShowOptions } from '@responsedock/sdk-browser';

export interface SurveyModalProps extends Omit<SdkShowOptions, 'onClose'> {
  surveyId: string;
  open: boolean;
  /** Called when the respondent or the survey closes the modal (not when you set `open={false}`). */
  onClose?: (event: SdkCloseEvent) => void;
}

/**
 * Controlled survey modal. The overlay is rendered by the browser SDK outside the
 * React tree; this component opens and closes it to match `open`.
 */
export function SurveyModal({ surveyId, open, title, loadTimeoutMs, autoCloseAfterMs, ...callbacks }: SurveyModalProps) {
  const latest = useRef({ open, callbacks });
  latest.current = { open, callbacks };

  useEffect(() => {
    if (!open) return undefined;
    // Callbacks are suppressed when the parent itself closed the modal: it already knows.
    const userDriven = () => latest.current.open;
    const cb = () => latest.current.callbacks;
    const controller = ResponseDock.show(surveyId, {
      ...(title !== undefined ? { title } : {}),
      ...(loadTimeoutMs !== undefined ? { loadTimeoutMs } : {}),
      ...(autoCloseAfterMs !== undefined ? { autoCloseAfterMs } : {}),
      onReady: (event) => cb().onReady?.(event),
      onComplete: (event) => cb().onComplete?.(event),
      onError: (event) => cb().onError?.(event),
      onResize: (event) => cb().onResize?.(event),
      onStepChange: (event) => cb().onStepChange?.(event),
      onRedirect: (event) => cb().onRedirect?.(event),
      onDismiss: (event) => { if (userDriven()) cb().onDismiss?.(event); },
      onClose: (event) => { if (userDriven()) cb().onClose?.(event); },
    });
    return () => {
      // open → false closes; unmount or a surveyId change while open removes it silently.
      if (latest.current.open) controller.destroy();
      else controller.close();
    };
  }, [open, surveyId, title, loadTimeoutMs, autoCloseAfterMs]);

  return null;
}

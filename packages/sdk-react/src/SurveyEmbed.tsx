import React, { useContext, useEffect, useRef } from 'react';
import { ResponseDock } from '@responsedock/sdk-browser';
import type { SdkEmbedOptions } from '@responsedock/sdk-browser';
import { SurveyContext } from './SurveyProvider.js';

export interface SurveyEmbedProps extends SdkEmbedOptions {
  surveyId: string;
  style?: React.CSSProperties;
  className?: string;
}

export function SurveyEmbed({
  surveyId,
  style,
  className,
  title,
  minHeight,
  loading,
  scrollOffset,
  loadTimeoutMs,
  ...callbacks
}: SurveyEmbedProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;
  // Re-embed when the provider points the SDK at another project or survey host.
  const configKey = useContext(SurveyContext)?.configKey;

  useEffect(() => {
    if (!containerRef.current) return undefined;
    const controller = ResponseDock.embed(surveyId, containerRef.current, {
      ...(title !== undefined ? { title } : {}),
      ...(minHeight !== undefined ? { minHeight } : {}),
      ...(loading !== undefined ? { loading } : {}),
      ...(scrollOffset !== undefined ? { scrollOffset } : {}),
      ...(loadTimeoutMs !== undefined ? { loadTimeoutMs } : {}),
      onReady: (event) => callbacksRef.current.onReady?.(event),
      onComplete: (event) => callbacksRef.current.onComplete?.(event),
      onDismiss: (event) => callbacksRef.current.onDismiss?.(event),
      onError: (event) => callbacksRef.current.onError?.(event),
      onResize: (event) => callbacksRef.current.onResize?.(event),
      onStepChange: (event) => callbacksRef.current.onStepChange?.(event),
      onRedirect: (event) => callbacksRef.current.onRedirect?.(event),
    });
    return () => controller?.destroy();
  }, [surveyId, configKey, title, minHeight, loading, scrollOffset, loadTimeoutMs]);

  // The iframe sizes itself to the survey; the container only needs full width.
  return <div ref={containerRef} className={className} style={{ width: '100%', ...style }} />;
}

import { useContext } from 'react';
import { SurveyContext } from './SurveyProvider.js';

export function useSurvey() {
  const ctx = useContext(SurveyContext);
  if (!ctx) {
    throw new Error('useSurvey must be used within a <SurveyProvider>');
  }
  return ctx;
}

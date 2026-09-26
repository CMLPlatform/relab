import { useCallback, useState } from 'react';
import { create } from 'zustand';
import { useAuth } from '@/context/auth';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import { acceptContributorTerms } from '@/services/api/terms';
import { getSessionItem, removeSessionItem, setSessionItem } from '@/services/storage';

type TermsPromptState = {
  dismissed: boolean;
  setDismissed: (dismissed: boolean) => void;
};

const DISMISSED_SESSION_KEY = 'terms_prompt_dismissed';

/**
 * Whether the prompt has been dismissed this session. A shared store because
 * the global dialog and the account row must see the same dismissal. Held in
 * sessionStorage on web so a reload does not re-ask; session-scoped so a later
 * sign-in asks again. Native keeps it in memory, which has the same lifetime.
 */
export const useTermsPromptDismissed = create<TermsPromptState>()((set) => ({
  dismissed: getSessionItem(DISMISSED_SESSION_KEY) === 'true',
  setDismissed: (dismissed) => {
    if (dismissed) setSessionItem(DISMISSED_SESSION_KEY, 'true');
    else removeSessionItem(DISMISSED_SESSION_KEY);
    set({ dismissed });
  },
}));

/**
 * Whether to prompt this account for the contributor terms, and how to accept.
 * The server decides (`termsAcceptanceRequired`); the app never compares
 * versions itself. Declining keeps full access.
 */
export function useTermsAcceptance() {
  const { user, refetch } = useAuth();
  const feedback = useAppFeedback();
  const dismissed = useTermsPromptDismissed((state) => state.dismissed);
  const setDismissed = useTermsPromptDismissed((state) => state.setDismissed);
  const [isAccepting, setIsAccepting] = useState(false);

  const required = user?.termsAcceptanceRequired === true;

  const accept = useCallback(async () => {
    setIsAccepting(true);
    try {
      await acceptContributorTerms();
      // Refetch rather than patch locally: the server owns the version it recorded.
      await refetch(true);
      feedback.toast('Thank you — your contributions can now be included in published datasets.');
    } catch (error) {
      feedback.error(
        error instanceof Error ? error.message : 'Please try again.',
        'Could not record your acceptance',
      );
    } finally {
      setIsAccepting(false);
    }
  }, [refetch, feedback]);

  return {
    /** True when the account still owes acceptance, regardless of dismissal. */
    required,
    /** True when the interrupting prompt should be on screen right now. */
    shouldPrompt: required && !dismissed,
    isAccepting,
    accept,
    dismiss: useCallback(() => setDismissed(true), [setDismissed]),
    /** Reopen after a dismissal, the account screen's entry point. */
    reopen: useCallback(() => setDismissed(false), [setDismissed]),
  };
}

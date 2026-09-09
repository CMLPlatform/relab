import { useCallback, useState } from 'react';
import { create } from 'zustand';
import { useAuth } from '@/context/auth';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import { acceptContributorTerms } from '@/services/api/terms';

type TermsPromptState = {
  dismissed: boolean;
  setDismissed: (dismissed: boolean) => void;
};

const DISMISSED_SESSION_KEY = 'terms_prompt_dismissed';

// sessionStorage is web only; on native the dismissal is in-memory state with the same lifetime.
function readDismissed(): boolean {
  try {
    return globalThis.sessionStorage?.getItem(DISMISSED_SESSION_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeDismissed(dismissed: boolean): void {
  try {
    if (dismissed) {
      globalThis.sessionStorage?.setItem(DISMISSED_SESSION_KEY, 'true');
    } else {
      globalThis.sessionStorage?.removeItem(DISMISSED_SESSION_KEY);
    }
  } catch {
    // Non-fatal: an opaque origin forbids storage; the dismissal then lasts until reload.
  }
}

/**
 * Whether the prompt has been dismissed this session. A shared store because
 * the global dialog and the account row must see the same dismissal. Held in
 * sessionStorage on web so a reload does not re-ask; session-scoped so a later
 * sign-in asks again.
 */
export const useTermsPromptDismissed = create<TermsPromptState>()((set) => ({
  dismissed: readDismissed(),
  setDismissed: (dismissed) => {
    writeDismissed(dismissed);
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

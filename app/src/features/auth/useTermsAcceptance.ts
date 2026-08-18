import { useCallback, useState } from 'react';
import { create } from 'zustand';
import { useAuth } from '@/context/auth';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import { acceptContributorTerms } from '@/services/api/terms';

type TermsPromptState = {
  dismissed: boolean;
  setDismissed: (dismissed: boolean) => void;
};

/**
 * Whether the prompt has been waved away for this session.
 *
 * A shared store rather than state inside the hook: the dialog is mounted once
 * globally while the account screen offers a way back to it, so two callers must
 * see the same dismissal. With local state, "open it again" from the account row
 * would toggle a copy the mounted dialog never reads.
 *
 * Deliberately not persisted — declining costs nothing, so the next login asks
 * again rather than the refusal being permanent.
 */
export const useTermsPromptDismissed = create<TermsPromptState>()((set) => ({
  dismissed: false,
  setDismissed: (dismissed) => set({ dismissed }),
}));

/**
 * Whether to prompt this account for the contributor terms, and how to accept.
 *
 * The server decides whether a prompt is due (`termsAcceptanceRequired`), so the
 * app never compares version numbers itself — the dataset release keys on the same
 * rule, and a second copy here would eventually ask a different set of people than
 * the release excludes.
 *
 * Declining costs nothing: the account keeps full access and its records simply
 * stay out of published releases.
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
    /** Reopen after a dismissal — the account screen's entry point. */
    reopen: useCallback(() => setDismissed(false), [setDismissed]),
  };
}

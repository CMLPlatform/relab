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

// sessionStorage exists on web only; on native the optional access throws or
// returns undefined and the dismissal is plain in-memory state, which is the
// same lifetime there — a native session ends when the app does.
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
    // Non-fatal: some contexts (e.g. an opaque origin) forbid storage. The
    // dismissal then lasts until the next reload, which is a nag, not a bug.
  }
}

/**
 * Whether the prompt has been waved away for this session.
 *
 * A shared store rather than state inside the hook: the dialog is mounted once
 * globally while the account screen offers a way back to it, so two callers must
 * see the same dismissal. With local state, "open it again" from the account row
 * would toggle a copy the mounted dialog never reads.
 *
 * Held in sessionStorage on web so a page reload does not re-ask. Purely
 * in-memory state looked equivalent until the browser was exercised: reloading
 * is routine, and being re-prompted on every refresh is nagging rather than
 * asking. Deliberately session-scoped and not persisted beyond it — declining
 * costs nothing, so a later sign-in should ask again rather than the refusal
 * standing forever.
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

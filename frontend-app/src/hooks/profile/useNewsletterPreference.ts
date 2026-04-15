import { useCallback, useEffect, useState } from 'react';
import { getNewsletterPreference, setNewsletterPreference } from '@/services/api/newsletter';

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function useNewsletterPreference(profilePresent: boolean) {
  const [newsletterSubscribed, setNewsletterSubscribed] = useState(false);
  const [newsletterLoading, setNewsletterLoading] = useState(true);
  const [newsletterSaving, setNewsletterSaving] = useState(false);
  const [newsletterError, setNewsletterError] = useState('');

  const loadNewsletterPreference = useCallback(async () => {
    if (!profilePresent) return;
    setNewsletterLoading(true);
    setNewsletterError('');

    try {
      const preference = await getNewsletterPreference();
      setNewsletterSubscribed(preference.subscribed);
      setNewsletterError('');
    } catch (error: unknown) {
      setNewsletterError(getErrorMessage(error, 'Unable to load email updates.'));
    } finally {
      setNewsletterLoading(false);
    }
  }, [profilePresent]);

  useEffect(() => {
    void loadNewsletterPreference();
  }, [loadNewsletterPreference]);

  const handleNewsletterToggle = async (nextSubscribed: boolean) => {
    if (!profilePresent || newsletterSaving) return;
    setNewsletterSaving(true);
    setNewsletterError('');

    try {
      const preference = await setNewsletterPreference(nextSubscribed);
      setNewsletterSubscribed(preference.subscribed);
    } catch (error: unknown) {
      setNewsletterError(getErrorMessage(error, 'Unable to update email updates.'));
    } finally {
      setNewsletterSaving(false);
    }
  };

  return {
    state: {
      subscribed: newsletterSubscribed,
      loading: newsletterLoading,
      saving: newsletterSaving,
      error: newsletterError,
    },
    actions: {
      reload: loadNewsletterPreference,
      toggle: handleNewsletterToggle,
    },
  };
}

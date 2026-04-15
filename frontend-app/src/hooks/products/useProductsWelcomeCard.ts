import { useEffect, useState } from 'react';
import { updateUser } from '@/services/api/authentication';
import { getLocalItem, setLocalItem } from '@/services/storage';
import { logError } from '@/utils/logging';

const GUEST_INFO_CARD_STORAGE_KEY = 'products_info_card_dismissed_guest';

type CurrentUser = {
  preferences?: {
    products_welcome_dismissed?: boolean;
  } | null;
};

type ProductsWelcomeCardParams = {
  isAuthenticated: boolean;
  currentUser?: CurrentUser | null;
  refetchUser?: (forceRefresh?: boolean) => Promise<unknown>;
};

export function useProductsWelcomeCard({
  isAuthenticated,
  currentUser,
  refetchUser,
}: ProductsWelcomeCardParams) {
  const [showInfoCard, setShowInfoCard] = useState<boolean | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      setShowInfoCard(currentUser?.preferences?.products_welcome_dismissed !== true);
      return;
    }

    let cancelled = false;
    const load = async () => {
      try {
        const dismissed = await getLocalItem(GUEST_INFO_CARD_STORAGE_KEY);
        if (!cancelled) setShowInfoCard(dismissed !== 'true');
      } catch {
        if (!cancelled) setShowInfoCard(true);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [currentUser?.preferences?.products_welcome_dismissed, isAuthenticated]);

  const dismissInfoCard = async () => {
    setShowInfoCard(false);
    if (isAuthenticated) {
      try {
        await updateUser({ preferences: { products_welcome_dismissed: true } });
        if (typeof refetchUser === 'function') {
          await refetchUser(false);
        }
      } catch (error) {
        logError('Failed to save info card preference:', error);
      }
      return;
    }

    try {
      await setLocalItem(GUEST_INFO_CARD_STORAGE_KEY, 'true');
    } catch (error) {
      logError('Failed to save info card preference:', error);
    }
  };

  return {
    showInfoCard,
    dismissInfoCard,
  };
}

import { createURL } from 'expo-linking';
import { useState } from 'react';
import { API_URL } from '@/config';
import { getToken } from '@/services/api/authentication';
import {
  buildOAuthAuthorizeUrl,
  fetchOAuthAuthorizationUrl,
  openOAuthBrowserSession,
} from '@/services/api/oauthFlow';

const OAUTH_DETAIL_PATTERN = /[?&]detail=([^&]*)/;

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

type Feedback = {
  error: (message: string, title?: string) => void;
};

type UseOAuthAssociationsParams = {
  feedback: Feedback;
  refetch: (forceRefresh?: boolean) => Promise<unknown>;
  setYoutubeEnabled: (enabled: boolean) => Promise<void>;
};

type OAuthProvider = 'google' | 'github';
type OAuthAssociationResult = { type: 'success'; url?: string } | { type: string; url?: string };

export function useOAuthAssociations({
  feedback,
  refetch,
  setYoutubeEnabled,
}: UseOAuthAssociationsParams) {
  const [youtubeAuthPending, setYoutubeAuthPending] = useState(false);

  const createAuthorizedHeaders = async () => {
    const token = await getToken();
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  };

  const startAssociationFlow = async (path: string): Promise<OAuthAssociationResult> => {
    const redirectUri = createURL('/profile');
    const associateUrl = buildOAuthAuthorizeUrl(`${API_URL}${path}`, redirectUri);
    const authorization = await fetchOAuthAuthorizationUrl(
      associateUrl,
      await createAuthorizedHeaders(),
    );

    if (!(authorization.ok && authorization.authorizationUrl)) {
      throw new Error(authorization.detail || 'Failed to reach association endpoint.');
    }

    const result = await openOAuthBrowserSession(authorization.authorizationUrl, redirectUri);
    if (result.type === 'success') {
      return { type: 'success', url: result.url };
    }
    return { type: String(result.type) };
  };

  const handleYouTubeToggle = async (next: boolean) => {
    if (!next) {
      await setYoutubeEnabled(false);
      return;
    }

    setYoutubeAuthPending(true);
    try {
      const result = await startAssociationFlow('/oauth/google-youtube/associate/authorize');
      if (result.type === 'success' && result.url?.includes('success=true')) {
        await setYoutubeEnabled(true);
        await refetch(false);
        return;
      }

      if (result.type === 'success') {
        const detail = result.url?.match(OAUTH_DETAIL_PATTERN)?.[1];
        feedback.error(
          detail ? decodeURIComponent(detail) : 'Access was denied.',
          'YouTube authorization failed',
        );
      }
    } catch (error: unknown) {
      feedback.error(
        `Failed to start YouTube authorization: ${getErrorMessage(error, 'Unknown error')}`,
        'Authorization failed',
      );
    } finally {
      setYoutubeAuthPending(false);
    }
  };

  const linkOAuth = async (provider: OAuthProvider) => {
    try {
      const result = await startAssociationFlow(`/oauth/${provider}/associate/authorize`);
      if (result.type === 'success') {
        await refetch();
      }
    } catch (error: unknown) {
      feedback.error(
        `Failed to start link flow: ${getErrorMessage(error, 'Unknown error')}`,
        'Link failed',
      );
    }
  };

  return {
    youtube: {
      authPending: youtubeAuthPending,
      toggle: handleYouTubeToggle,
    },
    actions: {
      linkOAuth,
      linkGoogle: () => linkOAuth('google'),
      linkGithub: () => linkOAuth('github'),
    },
  };
}

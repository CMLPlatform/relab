import { useRouter } from 'expo-router';
import { useAuth } from '@/context/auth';
import { useStreamSession } from '@/context/streamSession';
import { useServerPreferenceToggle } from '@/features/cameras/serverPreferenceToggle';
import type { Product } from '@/types/Product';
import { getStreamingState } from './productPageHelpers';

/** Streaming capabilities and navigation for the product video section. */
export function useProductVideo(product: Product) {
  const router = useRouter();
  const { user } = useAuth();
  const { enabled: rpiEnabled } = useServerPreferenceToggle('rpi_camera_enabled');
  const { enabled: youtubeEnabled } = useServerPreferenceToggle('youtube_streaming_enabled');
  const { activeStream } = useStreamSession();

  return {
    rpiEnabled,
    youtubeEnabled,
    isGoogleLinked:
      user?.oauth_accounts?.some((account) => account.oauth_name === 'google') ?? false,
    activeStream,
    ...getStreamingState(product, activeStream),
    ownedByMe: product.ownedBy === 'me',
    goToProfile: () => router.navigate('/account'),
    goToActiveStreamProduct: () => {
      if (!activeStream) return;
      router.push({
        pathname: '/products/[id]',
        params: { id: String(activeStream.productId) },
      });
    },
  };
}

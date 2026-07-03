import { useRouter } from 'expo-router';
import { useAuth } from '@/context/auth';
import { useStreamSession } from '@/context/streamSession';
import { useRpiIntegration } from '@/features/cameras/rpi/useRpiIntegration';
import { useYouTubeIntegration } from '@/features/cameras/youtube/useYouTubeIntegration';
import type { Product } from '@/types/Product';

/**
 * Streaming capabilities and navigation for the product video section.
 *
 * Reads integration/auth/stream state directly so ProductVideo does not need
 * these threaded through the product page's prop chain.
 */
export function useProductVideo(product: Product) {
  const router = useRouter();
  const { user } = useAuth();
  const { enabled: rpiEnabled } = useRpiIntegration();
  const { enabled: youtubeEnabled } = useYouTubeIntegration();
  const { activeStream } = useStreamSession();

  const streamingThisProduct =
    typeof product.id === 'number' && activeStream?.productId === product.id;

  return {
    rpiEnabled,
    youtubeEnabled,
    isGoogleLinked:
      user?.oauth_accounts?.some((account) => account.oauth_name === 'google') ?? false,
    activeStream,
    streamingThisProduct,
    streamingOtherProduct: !!activeStream && !streamingThisProduct,
    ownedByMe: product.ownedBy === 'me',
    goToProfile: () => router.push('/account'),
    goToActiveStreamProduct: () => {
      if (!activeStream) return;
      router.push({
        pathname: '/products/[id]',
        params: { id: String(activeStream.productId) },
      });
    },
  };
}

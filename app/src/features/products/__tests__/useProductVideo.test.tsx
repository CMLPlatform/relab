import { describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { useProductVideo } from '@/features/products/useProductVideo';
import type { Product } from '@/types/Product';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@/context/auth', () => ({
  useAuth: () => ({
    user: {
      oauth_accounts: [{ oauth_name: 'google' }],
    },
  }),
}));

jest.mock('@/context/streamSession', () => ({
  useStreamSession: () => ({
    activeStream: { productId: 99, productName: 'Stream Product' },
  }),
}));

jest.mock('@/features/cameras/rpi/useRpiIntegration', () => ({
  useRpiIntegration: () => ({ enabled: true }),
}));

jest.mock('@/features/cameras/youtube/useYouTubeIntegration', () => ({
  useYouTubeIntegration: () => ({ enabled: true }),
}));

const product = { id: 42, name: 'Desk Radio', ownedBy: 'me' } as Product;

describe('useProductVideo', () => {
  it('derives streaming capabilities from integrations and stream session', () => {
    const { result } = renderHook(() => useProductVideo(product));

    expect(result.current.rpiEnabled).toBe(true);
    expect(result.current.youtubeEnabled).toBe(true);
    expect(result.current.isGoogleLinked).toBe(true);
    expect(result.current.ownedByMe).toBe(true);
    expect(result.current.streamingThisProduct).toBe(false);
    expect(result.current.streamingOtherProduct).toBe(true);
  });

  it('flags streaming for the product that owns the active stream', () => {
    const { result } = renderHook(() => useProductVideo({ ...product, id: 99 }));

    expect(result.current.streamingThisProduct).toBe(true);
    expect(result.current.streamingOtherProduct).toBe(false);
  });

  it('navigates to the active stream product and profile setup routes', () => {
    const { result } = renderHook(() => useProductVideo(product));

    act(() => {
      result.current.goToActiveStreamProduct();
      result.current.goToProfile();
    });

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/products/[id]',
      params: { id: '99' },
    });
    expect(mockPush).toHaveBeenCalledWith('/account');
  });
});

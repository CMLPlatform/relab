import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { useCamerasScreen } from '@/hooks/useCamerasScreen';

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockSetOptions = jest.fn();
const mockRefetch = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: jest.fn(),
  }),
  useNavigation: () => ({
    setOptions: mockSetOptions,
  }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('@/context/AuthProvider', () => ({
  useAuth: () => ({
    user: { id: 'user-1', email: 'test@example.com' },
  }),
}));

jest.mock('@/context/StreamSessionContext', () => ({
  useStreamSession: () => ({
    setActiveStream: jest.fn(),
  }),
}));

jest.mock('@/hooks/useAppFeedback', () => ({
  useAppFeedback: () => ({
    alert: jest.fn(),
    error: jest.fn(),
  }),
}));

jest.mock('@/hooks/useEffectiveCameraConnection', () => ({
  resolveEffectiveCameraConnection: () => ({ isReachable: true }),
}));

jest.mock('@/hooks/useIsDesktop', () => ({
  useIsDesktop: () => false,
}));

jest.mock('@/hooks/useProductQueries', () => ({
  useProductQuery: () => ({ data: null }),
}));

const mockCamerasQueryData = [
  {
    id: 'camera-1',
    name: 'Test Camera',
  },
];

jest.mock('@/hooks/useRpiCameras', () => ({
  useCamerasQuery: () => ({
    data: mockCamerasQueryData,
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: mockRefetch,
  }),
  useCaptureAllMutation: () => ({
    mutate: jest.fn(),
    isPending: false,
  }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: jest.fn(),
  }),
}));

describe('useCamerasScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns grouped screen, selection, streaming, and action domains', () => {
    const { result } = renderHook(() => useCamerasScreen());

    expect(result.current.screen.rows).toEqual(mockCamerasQueryData);
    expect(result.current.selection.selectedCount).toBe(0);
    expect(result.current.streaming.streamDialog.cameraId).toBeNull();
    expect(typeof result.current.streaming.dismissSnackbar).toBe('function');
    expect(typeof result.current.actions.openAddCamera).toBe('function');
  });

  it('uses named actions for add-camera navigation and selection mode', () => {
    const { result } = renderHook(() => useCamerasScreen());

    act(() => {
      result.current.actions.openAddCamera();
      result.current.actions.handleCardLongPress(mockCamerasQueryData[0] as never);
    });

    expect(mockPush).toHaveBeenCalledWith('/cameras/add');
    expect(result.current.selection.selectionMode).toBe(false);
  });
});

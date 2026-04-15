import { render } from '@testing-library/react-native';
import * as useRpi from '@/hooks/useRpiCameras';
import { LivePreview } from '../LivePreview';

jest.mock('@/hooks/useRpiCameras');

// Mock hls.js so the dynamic import resolves synchronously in Jest.
jest.mock('hls.js', () => {
  const mockInstance = {
    loadSource: jest.fn(),
    attachMedia: jest.fn(),
    on: jest.fn(),
    destroy: jest.fn(),
  };
  const MockHls = Object.assign(
    jest.fn(() => mockInstance),
    {
      isSupported: jest.fn().mockReturnValue(true),
      Events: { ERROR: 'hlsError' },
    },
  );
  return { __esModule: true, default: MockHls };
});

describe('LivePreview', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    // Restore hls.js mock state after resetAllMocks wipes it
    const Hls = require('hls.js').default;
    Hls.isSupported.mockReturnValue(true);
  });

  it('returns null when there is no hlsUrl', () => {
    (useRpi.useCameraLivePreview as jest.Mock).mockReturnValue({ hlsUrl: null });
    const { toJSON } = render(<LivePreview camera={{ id: '1' }} />);
    expect(toJSON()).toBeNull();
  });

  it('returns null when camera is null', () => {
    (useRpi.useCameraLivePreview as jest.Mock).mockReturnValue({ hlsUrl: null });
    const { toJSON } = render(<LivePreview camera={null} />);
    expect(toJSON()).toBeNull();
  });

  describe('web platform', () => {
    beforeEach(() => {
      const rn = require('react-native');
      Object.defineProperty(rn.Platform, 'OS', { value: 'web', configurable: true });
      (useRpi.useCameraLivePreview as jest.Mock).mockReturnValue({
        hlsUrl: 'http://example/stream.m3u8',
      });
    });

    afterEach(() => {
      const rn = require('react-native');
      Object.defineProperty(rn.Platform, 'OS', { value: 'ios', configurable: true });
    });

    it('renders caption when hlsUrl is present', () => {
      const { getByText } = render(<LivePreview camera={{ id: '1' }} />);
      expect(getByText('Live preview · LL-HLS')).toBeTruthy();
    });

    it('shows the loading overlay initially', () => {
      const { getByText } = render(<LivePreview camera={{ id: '1' }} />);
      // state starts as 'loading' before the HLS player attaches
      expect(getByText('Loading preview…')).toBeTruthy();
    });

    it('passes enabled=false to useCameraLivePreview', () => {
      (useRpi.useCameraLivePreview as jest.Mock).mockReturnValue({ hlsUrl: null });
      const { toJSON } = render(<LivePreview camera={{ id: '1' }} enabled={false} />);
      expect(useRpi.useCameraLivePreview).toHaveBeenCalledWith({ id: '1' }, { enabled: false });
      expect(toJSON()).toBeNull();
    });
  });

  describe('native platform', () => {
    beforeEach(() => {
      const rn = require('react-native');
      Object.defineProperty(rn.Platform, 'OS', { value: 'ios', configurable: true });
      (useRpi.useCameraLivePreview as jest.Mock).mockReturnValue({
        hlsUrl: 'http://example/stream.m3u8',
      });
    });

    it('renders the VideoView and caption', () => {
      const { getByTestId, getByText } = render(<LivePreview camera={{ id: '1' }} />);
      // expo-video is mocked in jest.setup.ts to render a View with testID='expo-video-view'
      expect(getByTestId('expo-video-view')).toBeTruthy();
      expect(getByText('Live preview · LL-HLS')).toBeTruthy();
    });
  });
});

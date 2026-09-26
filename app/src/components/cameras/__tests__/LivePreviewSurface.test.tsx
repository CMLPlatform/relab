import { render } from '@testing-library/react-native';
import { LivePreview } from '@/components/cameras/LivePreview';
import { useCameraLivePreview } from '@/features/cameras/rpi/hooks';

jest.mock('@/features/cameras/rpi/hooks');
jest.mock('@/components/cameras/live-preview/previewOverlays', () => ({
  PreviewShell: ({ caption, children }: { caption: string; children: React.ReactNode }) => {
    const React = jest.requireActual<typeof import('react')>('react');
    const { Text, View } = jest.requireActual<typeof import('react-native')>('react-native');
    return React.createElement(
      View,
      { testID: 'preview-shell' },
      React.createElement(Text, null, caption),
      children,
    );
  },
}));
function mockPlayer(kind: string) {
  return ({ src }: { src: string }) => {
    const React = jest.requireActual<typeof import('react')>('react');
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return React.createElement(Text, { testID: 'preview-player' }, `${kind}:${src}`);
  };
}
jest.mock('@/components/cameras/live-preview/WebHlsVideo', () => ({
  WebHlsVideo: mockPlayer('web'),
}));
jest.mock('@/components/cameras/live-preview/NativeHlsVideo', () => ({
  NativeHlsVideo: mockPlayer('native'),
}));

const mockUseCameraLivePreview = jest.mocked(useCameraLivePreview);

describe('LivePreview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when there is no hlsUrl', async () => {
    mockUseCameraLivePreview.mockReturnValue({ hlsUrl: null } as never);
    const { toJSON } = await render(<LivePreview camera={{ id: '1' }} />);
    expect(toJSON()).toBeNull();
  });

  it('returns null when camera is null', async () => {
    mockUseCameraLivePreview.mockReturnValue({ hlsUrl: null } as never);
    const { toJSON } = await render(<LivePreview camera={null} />);
    expect(toJSON()).toBeNull();
  });

  describe('web platform', () => {
    beforeEach(() => {
      const rn = require('react-native');
      Object.defineProperty(rn.Platform, 'OS', { value: 'web', configurable: true });
      mockUseCameraLivePreview.mockReturnValue({
        hlsUrl: 'http://example/stream.m3u8',
      } as never);
    });

    afterEach(() => {
      const rn = require('react-native');
      Object.defineProperty(rn.Platform, 'OS', { value: 'ios', configurable: true });
    });

    it('renders caption when hlsUrl is present', async () => {
      const { getByText } = await render(<LivePreview camera={{ id: '1' }} />);
      expect(getByText('Live preview · LL-HLS')).toBeTruthy();
    });

    it('renders the preview player with the HLS URL', async () => {
      const { getByTestId } = await render(<LivePreview camera={{ id: '1' }} />);
      expect(getByTestId('preview-player').props.children).toBe('web:http://example/stream.m3u8');
    });

    it('passes enabled=false to useCameraLivePreview', async () => {
      mockUseCameraLivePreview.mockReturnValue({ hlsUrl: null } as never);
      const { toJSON } = await render(<LivePreview camera={{ id: '1' }} enabled={false} />);
      expect(useCameraLivePreview).toHaveBeenCalledWith({ id: '1' }, { enabled: false });
      expect(toJSON()).toBeNull();
    });
  });

  describe('native platform', () => {
    beforeEach(() => {
      const rn = require('react-native');
      Object.defineProperty(rn.Platform, 'OS', { value: 'ios', configurable: true });
      mockUseCameraLivePreview.mockReturnValue({
        hlsUrl: 'http://example/stream.m3u8',
      } as never);
    });

    it('renders the preview player and caption', async () => {
      const { getByTestId, getByText } = await render(<LivePreview camera={{ id: '1' }} />);
      expect(getByTestId('preview-player').props.children).toBe(
        'native:http://example/stream.m3u8',
      );
      expect(getByText('Live preview · LL-HLS')).toBeTruthy();
    });
  });
});

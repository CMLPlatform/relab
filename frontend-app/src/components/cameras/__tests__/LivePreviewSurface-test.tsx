import { render } from '@testing-library/react-native';
import { useCameraLivePreview } from '@/hooks/useRpiCameras';
import { LivePreview } from '../LivePreview';

jest.mock('@/hooks/useRpiCameras');
jest.mock('@/components/cameras/live-preview/caption', () => ({
  getLivePreviewCaption: jest.fn((isLocalStream: boolean) =>
    isLocalStream ? 'Live preview · Direct' : 'Live preview · LL-HLS',
  ),
}));
jest.mock('@/components/cameras/live-preview/shared', () => ({
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
jest.mock('@/components/cameras/live-preview/PreviewPlayer', () => ({
  PreviewPlayer: ({ src }: { src: string }) => {
    const React = jest.requireActual<typeof import('react')>('react');
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return React.createElement(Text, { testID: 'preview-player' }, `player:${src}`);
  },
}));

const mockUseCameraLivePreview = jest.mocked(useCameraLivePreview);

describe('LivePreview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when there is no hlsUrl', () => {
    mockUseCameraLivePreview.mockReturnValue({ hlsUrl: null } as never);
    const { toJSON } = render(<LivePreview camera={{ id: '1' }} />);
    expect(toJSON()).toBeNull();
  });

  it('returns null when camera is null', () => {
    mockUseCameraLivePreview.mockReturnValue({ hlsUrl: null } as never);
    const { toJSON } = render(<LivePreview camera={null} />);
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

    it('renders caption when hlsUrl is present', () => {
      const { getByText } = render(<LivePreview camera={{ id: '1' }} />);
      expect(getByText('Live preview · LL-HLS')).toBeTruthy();
    });

    it('renders the preview player with the HLS URL', () => {
      const { getByTestId } = render(<LivePreview camera={{ id: '1' }} />);
      expect(getByTestId('preview-player').props.children).toBe(
        'player:http://example/stream.m3u8',
      );
    });

    it('passes enabled=false to useCameraLivePreview', () => {
      mockUseCameraLivePreview.mockReturnValue({ hlsUrl: null } as never);
      const { toJSON } = render(<LivePreview camera={{ id: '1' }} enabled={false} />);
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

    it('renders the preview player and caption', () => {
      const { getByTestId, getByText } = render(<LivePreview camera={{ id: '1' }} />);
      expect(getByTestId('preview-player')).toBeTruthy();
      expect(getByText('Live preview · LL-HLS')).toBeTruthy();
    });
  });
});

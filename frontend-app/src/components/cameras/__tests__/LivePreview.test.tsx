import { render } from '@testing-library/react-native';
import * as useRpi from '@/hooks/useRpiCameras';
import { LivePreview } from '../LivePreview';

jest.mock('@/hooks/useRpiCameras');

describe('LivePreview', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('returns null when there is no hlsUrl', () => {
    (useRpi.useCameraLivePreview as jest.Mock).mockReturnValue({ hlsUrl: null });
    const { toJSON } = render(<LivePreview camera={{ id: '1' }} />);
    expect(toJSON()).toBeNull();
  });

  it('renders caption when hlsUrl present on web', () => {
    (useRpi.useCameraLivePreview as jest.Mock).mockReturnValue({
      hlsUrl: 'http://example/stream.m3u8',
    });
    // Force Platform.OS to web for this test
    const rn = require('react-native');
    Object.defineProperty(rn.Platform, 'OS', { value: 'web', configurable: true });

    const { getByText } = render(<LivePreview camera={{ id: '1' }} />);
    expect(getByText('Live preview · LL-HLS')).toBeTruthy();
  });
});

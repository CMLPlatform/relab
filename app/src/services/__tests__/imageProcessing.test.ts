import { beforeEach, describe, expect, it, jest } from '@jest/globals';

type SaveAsync = (options: { compress: number }) => Promise<{ uri: string }>;
type RenderAsync = () => Promise<{ saveAsync: jest.MockedFunction<SaveAsync> }>;
type Manipulator = {
  renderAsync: jest.MockedFunction<RenderAsync>;
  resize: (args: { width: number; height: number }) => Manipulator;
};

const mockSaveAsync = jest.fn<SaveAsync>();
const mockRenderAsync = jest.fn<RenderAsync>();
const mockResize = jest.fn<Manipulator['resize']>();
const mockManipulate = jest.fn<(uri: string) => Manipulator>();

jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: {
    manipulate: mockManipulate,
  },
}));

const { processImage } =
  require('@/services/imageProcessing') as typeof import('@/services/imageProcessing');

const MB = 1024 * 1024;
const CONTRIBUTOR = { maxBytes: 10 * MB, maxPixels: 30_000_000, maxSidePx: 10_000 };
const LAB = { maxBytes: 40 * MB, maxPixels: 50_000_000, maxSidePx: 10_000 };

describe('processImage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const manipulator: Manipulator = { renderAsync: mockRenderAsync, resize: mockResize };
    mockSaveAsync.mockResolvedValue({ uri: 'file://processed.jpg' });
    mockRenderAsync.mockResolvedValue({ saveAsync: mockSaveAsync });
    mockResize.mockReturnValue(manipulator);
    mockManipulate.mockReturnValue(manipulator);
  });

  it('returns a photo within the caps untouched, at full resolution', async () => {
    const asset = { uri: 'file://12mp.jpg', width: 4000, height: 3000, fileSize: 5 * MB };

    await expect(processImage(asset, CONTRIBUTOR)).resolves.toBe('file://12mp.jpg');
    expect(mockManipulate).not.toHaveBeenCalled();
  });

  it('keeps a 48 MP original untouched for a lab account', async () => {
    const asset = { uri: 'file://48mp.jpg', width: 8000, height: 6000, fileSize: 24 * MB };

    await expect(processImage(asset, LAB)).resolves.toBe('file://48mp.jpg');
    expect(mockManipulate).not.toHaveBeenCalled();
  });

  it('scales a photo over the pixel cap down just enough to fit it', async () => {
    const asset = { uri: 'file://48mp.jpg', width: 8000, height: 6000, fileSize: 24 * MB };

    await expect(processImage(asset, CONTRIBUTOR)).resolves.toBe('file://processed.jpg');
    const [{ width, height }] = mockResize.mock.calls[0];
    expect(width * height).toBeLessThanOrEqual(CONTRIBUTOR.maxPixels);
    expect(width * height).toBeGreaterThan(CONTRIBUTOR.maxPixels * 0.999);
    expect(width / height).toBeCloseTo(8000 / 6000, 3);
  });

  it('scales a panorama over the per-side cap down to that side', async () => {
    const asset = { uri: 'file://pano.jpg', width: 16_000, height: 1_000 };

    await processImage(asset, CONTRIBUTOR);
    expect(mockResize).toHaveBeenCalledWith({ width: 10_000, height: 625 });
  });

  it('re-encodes without resizing a photo only over the byte cap', async () => {
    const asset = { uri: 'file://heavy.jpg', width: 4000, height: 3000, fileSize: 15 * MB };

    await expect(processImage(asset, CONTRIBUTOR)).resolves.toBe('file://processed.jpg');
    expect(mockResize).not.toHaveBeenCalled();
    expect(mockSaveAsync).toHaveBeenCalledWith({ compress: 0.9 });
  });

  it('leaves a photo with unknown dimensions and size to the server check', async () => {
    await expect(processImage({ uri: 'file://unknown.jpg' }, CONTRIBUTOR)).resolves.toBe(
      'file://unknown.jpg',
    );
    expect(mockManipulate).not.toHaveBeenCalled();
  });

  it('returns null when the manipulator fails', async () => {
    mockRenderAsync.mockRejectedValueOnce(new Error('Manipulator failed'));
    const asset = { uri: 'file://bad.jpg', width: 8000, height: 6000 };

    await expect(processImage(asset, CONTRIBUTOR)).resolves.toBeNull();
  });
});

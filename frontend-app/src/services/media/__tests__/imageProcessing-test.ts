import { beforeEach, describe, expect, it, jest } from '@jest/globals';

type SaveAsync = () => Promise<{ uri: string }>;
type RenderAsync = () => Promise<{ saveAsync: jest.MockedFunction<SaveAsync> }>;
type ResizeResult = {
  renderAsync: jest.MockedFunction<RenderAsync>;
  resize: (args: { width?: number; height?: number }) => ResizeResult;
};
type ResizeFn = (args: { width?: number; height?: number }) => ResizeResult;
type ManipulateFn = (uri: string) => ResizeResult;

const mockSaveAsync = jest.fn<() => Promise<{ uri: string }>>();
const mockRenderAsync = jest.fn<() => Promise<{ saveAsync: typeof mockSaveAsync }>>();
const mockResize = jest.fn<ResizeFn>();
const mockManipulate = jest.fn<ManipulateFn>();

jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: {
    manipulate: mockManipulate,
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { processImage } = require('../imageProcessing') as typeof import('../imageProcessing');

describe('processImage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSaveAsync.mockResolvedValue({ uri: 'file://processed.jpg' });
    mockRenderAsync.mockResolvedValue({ saveAsync: mockSaveAsync });
    mockResize.mockReturnValue({ renderAsync: mockRenderAsync, resize: mockResize });
    mockManipulate.mockReturnValue({ resize: mockResize, renderAsync: mockRenderAsync });
  });

  it('returns processed URI for a normal image', async () => {
    const asset = { uri: 'file://photo.jpg', width: 100, height: 100 };
    const result = await processImage(asset);
    expect(result).toBe('file://processed.jpg');
    expect(mockManipulate).toHaveBeenCalledWith('file://photo.jpg');
  });

  it("calls onError with 'size' and returns null when file exceeds max size", async () => {
    const onError = jest.fn();
    const asset = {
      uri: 'file://large.jpg',
      width: 100,
      height: 100,
      fileSize: 15 * 1024 * 1024, // 15 MB > 10 MB limit
    };
    const result = await processImage(asset, { onError });
    expect(result).toBeNull();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ type: 'size' }));
  });

  it('does not call resize when image is within dimensions', async () => {
    const asset = { uri: 'file://small.jpg', width: 800, height: 600 };
    await processImage(asset);
    expect(mockResize).not.toHaveBeenCalled();
  });

  it('resizes by width when image is wider than tall and exceeds maxWidth', async () => {
    const asset = { uri: 'file://wide.jpg', width: 3000, height: 1000 };
    await processImage(asset, { maxWidth: 1920, maxHeight: 1920 });
    expect(mockResize).toHaveBeenCalledWith({ width: 1920 });
  });

  it('resizes by height when image is taller than wide and exceeds maxHeight', async () => {
    const asset = { uri: 'file://tall.jpg', width: 1000, height: 3000 };
    await processImage(asset, { maxWidth: 1920, maxHeight: 1920 });
    expect(mockResize).toHaveBeenCalledWith({ height: 1920 });
  });

  it("calls onError with 'processing' and returns null when manipulator throws", async () => {
    const onError = jest.fn();
    mockRenderAsync.mockRejectedValueOnce(new Error('Manipulator failed'));
    const asset = { uri: 'file://bad.jpg', width: 100, height: 100 };
    const result = await processImage(asset, { onError });
    expect(result).toBeNull();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ type: 'processing' }));
  });

  it('processes image with no dimensions provided', async () => {
    const asset = { uri: 'file://no_dim.jpg' };
    const result = await processImage(asset);
    expect(result).toBe('file://processed.jpg');
    expect(mockResize).not.toHaveBeenCalled();
  });
});

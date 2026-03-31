import { describe, expect, it } from '@jest/globals';
import { PRODUCT_NAME_MAX_LENGTH, PRODUCT_NAME_MIN_LENGTH, productSchema } from '../productSchema';

const validBase = {
  id: 1 as number | 'new',
  name: 'Valid Product',
  componentIDs: [] as number[],
  physicalProperties: {
    weight: 100,
    width: 10,
    height: 5,
    depth: 3,
  },
  circularityProperties: {
    recyclabilityObservation: 'low',
    recyclabilityComment: null as string | null | undefined,
    recyclabilityReference: null as string | null | undefined,
    remanufacturabilityObservation: 'medium',
    remanufacturabilityComment: null as string | null | undefined,
    remanufacturabilityReference: null as string | null | undefined,
    repairabilityObservation: 'high',
    repairabilityComment: null as string | null | undefined,
    repairabilityReference: null as string | null | undefined,
  },
  images: [] as { id?: number; url: string; description: string }[],
  videos: [] as { id?: number; url: string; title: string; description: string }[],
  ownedBy: 'me',
};

describe('productSchema', () => {
  it('parses a valid product with numeric id', () => {
    const result = productSchema.safeParse(validBase);
    expect(result.success).toBe(true);
  });

  it("accepts 'new' as id", () => {
    const result = productSchema.safeParse({ ...validBase, id: 'new' });
    expect(result.success).toBe(true);
  });

  it(`rejects name shorter than ${PRODUCT_NAME_MIN_LENGTH} characters`, () => {
    const result = productSchema.safeParse({ ...validBase, name: 'a' });
    expect(result.success).toBe(false);
  });

  it(`rejects name longer than ${PRODUCT_NAME_MAX_LENGTH} characters`, () => {
    const result = productSchema.safeParse({
      ...validBase,
      name: 'a'.repeat(PRODUCT_NAME_MAX_LENGTH + 1),
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-positive weight', () => {
    const result = productSchema.safeParse({
      ...validBase,
      physicalProperties: { ...validBase.physicalProperties, weight: 0 },
    });
    expect(result.success).toBe(false);
  });

  it('accepts optional fields as undefined', () => {
    const minimal = {
      ...validBase,
      brand: undefined,
      model: undefined,
      description: undefined,
      productTypeID: undefined,
    };
    const result = productSchema.safeParse(minimal);
    expect(result.success).toBe(true);
  });

  // ─── video schema ─────────────────────────────────────────────────

  it('accepts a video with a valid http URL', () => {
    const result = productSchema.safeParse({
      ...validBase,
      videos: [{ url: 'http://example.com/video.mp4', title: 'Demo', description: '' }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts a video with a valid https URL', () => {
    const result = productSchema.safeParse({
      ...validBase,
      videos: [{ url: 'https://youtube.com/watch?v=abc123', title: 'Demo', description: '' }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a video with empty title', () => {
    const result = productSchema.safeParse({
      ...validBase,
      videos: [{ url: 'https://example.com/video', title: '', description: '' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a video with a non-URL string', () => {
    const result = productSchema.safeParse({
      ...validBase,
      videos: [{ url: 'not-a-url', title: 'Demo', description: '' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a video with ftp:// protocol (fails http/https refinement)', () => {
    // ftp:// is a valid URL but fails the http/https protocol refinement
    const result = productSchema.safeParse({
      ...validBase,
      videos: [{ url: 'ftp://example.com/video', title: 'Demo', description: '' }],
    });
    expect(result.success).toBe(false);
  });

  it('accepts a video with an optional id', () => {
    const result = productSchema.safeParse({
      ...validBase,
      videos: [{ id: 42, url: 'https://example.com/video', title: 'Demo', description: '' }],
    });
    expect(result.success).toBe(true);
  });

  // ─── image schema ─────────────────────────────────────────────────

  it('accepts an image with url and description', () => {
    const result = productSchema.safeParse({
      ...validBase,
      images: [{ url: 'https://example.com/img.jpg', description: 'Cover' }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts an image with optional thumbnailUrl', () => {
    const result = productSchema.safeParse({
      ...validBase,
      images: [
        {
          id: 1,
          url: 'https://example.com/img.jpg',
          thumbnailUrl: 'https://example.com/thumb.jpg',
          description: 'Cover',
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});

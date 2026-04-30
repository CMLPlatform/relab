import { z } from 'zod';

export const PRODUCT_NAME_MIN_LENGTH = 2;
export const PRODUCT_NAME_MAX_LENGTH = 100;
// spell-checker: ignore youtu.be

/**
 * Validates that a string is a properly-formatted URL (http or https).
 * Used by ProductVideo component and video schema validation.
 */
export function isValidUrl(value: string | undefined): true | false {
  if (!value || typeof value !== 'string') return false;

  const trimmed = value.trim();
  if (trimmed.length === 0) return false;

  try {
    const url = new URL(trimmed);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

const isYouTubeHostname = (hostname: string) => {
  const normalizedHostname = hostname.toLowerCase();
  return (
    normalizedHostname === 'youtu.be' ||
    normalizedHostname === 'youtube.com' ||
    normalizedHostname.endsWith('.youtube.com')
  );
};

const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

/**
 * Extracts the YouTube video ID from common YouTube URL formats.
 * Handles youtube.com/watch?v=ID, youtu.be/ID, and youtube.com/live/ID.
 * Returns null for non-YouTube URLs or invalid inputs.
 */
export function extractYouTubeVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return null;
    }
    let videoId: string | null = null;
    if (u.hostname === 'youtu.be') {
      videoId = u.pathname.slice(1) || null;
    }
    if (
      isYouTubeHostname(u.hostname) &&
      (u.hostname === 'youtube.com' || u.hostname.endsWith('.youtube.com'))
    ) {
      videoId = u.searchParams.get('v') ?? u.pathname.split('/').pop() ?? null;
    }
    return videoId && YOUTUBE_VIDEO_ID_PATTERN.test(videoId) ? videoId : null;
  } catch {
    // not a valid URL
  }
  return null;
}

/**
 * Helper text describing the allowed name length for product names.
 * Used in form validation feedback.
 */
export function getProductNameHelperText(): string {
  return `Enter a descriptive name between ${PRODUCT_NAME_MIN_LENGTH} and ${PRODUCT_NAME_MAX_LENGTH} characters`;
}

const physicalPropertiesSchema = z.object({
  weight: z.number({ message: 'Weight is required' }).positive('Weight must be a positive number'),
  width: z.number().positive('Width must be a positive number').or(z.nan()).optional(),
  height: z.number().positive('Height must be a positive number').or(z.nan()).optional(),
  depth: z.number().positive('Depth must be a positive number').or(z.nan()).optional(),
});

const circularityPropertiesSchema = z.object({
  recyclability: z.string().max(500).nullish(),
  disassemblability: z.string().max(500).nullish(),
  remanufacturability: z.string().max(500).nullish(),
});

const videoSchema = z.object({
  id: z.number().optional(),
  url: z
    .string()
    .url('Invalid video URL')
    .refine(
      (val) => {
        try {
          const url = new URL(val);
          return url.protocol === 'http:' || url.protocol === 'https:';
        } catch {
          return false;
        }
      },
      { message: 'Video URL must use http or https' },
    ),
  description: z.string(),
  title: z.string().min(1, 'Video title cannot be empty'),
});

const imageSchema = z.object({
  id: z.string().optional(),
  url: z.string(),
  thumbnailUrl: z.string().optional(),
  description: z.string(),
});

export const productSchema = z.object({
  id: z.number().optional(),
  parentID: z.number().optional(),
  name: z
    .string()
    .min(
      PRODUCT_NAME_MIN_LENGTH,
      `Product name must be at least ${PRODUCT_NAME_MIN_LENGTH} characters`,
    )
    .max(
      PRODUCT_NAME_MAX_LENGTH,
      `Product name must be at most ${PRODUCT_NAME_MAX_LENGTH} characters`,
    ),
  brand: z.string().optional(),
  model: z.string().optional(),
  description: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  productTypeID: z.number().optional(),
  productTypeName: z.string().optional(),
  componentIDs: z.array(z.number()),
  ownerUsername: z.string().optional(),
  physicalProperties: physicalPropertiesSchema,
  circularityProperties: circularityPropertiesSchema,
  images: z.array(imageSchema),
  thumbnailUrl: z.string().optional(),
  videos: z.array(videoSchema),
  ownedBy: z.string(),
  amountInParent: z.number().optional(),
});

export type ProductFormValues = z.infer<typeof productSchema>;

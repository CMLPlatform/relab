import { z } from 'zod';
import { isHttpUrl, isSafeImageUrl } from '@/utils/urlSafety';

export const PRODUCT_NAME_MIN_LENGTH = 2;
export const PRODUCT_NAME_MAX_LENGTH = 100;

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
    if (u.hostname === 'youtube.com' || u.hostname.endsWith('.youtube.com')) {
      videoId = u.searchParams.get('v') ?? u.pathname.split('/').pop() ?? null;
    }
    return videoId && YOUTUBE_VIDEO_ID_PATTERN.test(videoId) ? videoId : null;
  } catch {
    // not a valid URL
  }
  return null;
}

const physicalPropertiesSchema = z.object({
  weight: z.number().positive('Weight must be a positive number').or(z.nan()).optional(),
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
    .refine(isHttpUrl, { message: 'Video URL must use http or https' }),
  description: z.string(),
  // Backend allows a null/empty video title; the mapper coerces it to ''. Requiring
  // a non-empty title here would block editing any product that has such a video.
  title: z.string(),
});

const imageSchema = z.object({
  id: z.string().optional(),
  url: z.string().refine(isSafeImageUrl, { message: 'Image URL is not allowed' }),
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

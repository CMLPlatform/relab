import { z } from 'zod';

export const PRODUCT_NAME_MIN_LENGTH = 2;
export const PRODUCT_NAME_MAX_LENGTH = 100;

const physicalPropertiesSchema = z.object({
  weight: z.number({ message: 'Weight is required' }).positive('Weight must be a positive number'),
  width: z.number().positive('Width must be a positive number').or(z.nan()).optional(),
  height: z.number().positive('Height must be a positive number').or(z.nan()).optional(),
  depth: z.number().positive('Depth must be a positive number').or(z.nan()).optional(),
});

const circularityPropertiesSchema = z.object({
  recyclabilityComment: z.string().nullish(),
  recyclabilityObservation: z.string(),
  recyclabilityReference: z.string().nullish(),
  remanufacturabilityComment: z.string().nullish(),
  remanufacturabilityObservation: z.string(),
  remanufacturabilityReference: z.string().nullish(),
  repairabilityComment: z.string().nullish(),
  repairabilityObservation: z.string(),
  repairabilityReference: z.string().nullish(),
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
  id: z.number().optional(),
  url: z.string(),
  thumbnailUrl: z.string().optional(),
  description: z.string(),
});

export const productSchema = z.object({
  id: z.union([z.number(), z.literal('new')]),
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

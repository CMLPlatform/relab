import type { QueryClient } from '@tanstack/react-query';
import {
  type FeedbackApi,
  showGoogleAccountRequired,
  showStreamAlreadyLive,
  showStreamStartFailed,
  showStreamVideoSaveFailed,
} from '@/components/cameras/streamingFeedback';
import type { useStreamSession } from '@/context/streamSession';
import { invalidateProductQuery } from '@/features/products/queries';
import { ApiError } from '@/services/api/errors';
import { addProductVideo } from '@/services/api/products';
import type { YouTubePrivacyStatus } from '@/services/api/rpiCamera';
import { startYouTubeStream } from '@/services/api/rpiCamera';

type SetActiveStream = ReturnType<typeof useStreamSession>['setActiveStream'];

/**
 * Shared "start a YouTube stream" sequence: call the start-stream endpoint,
 * record the active stream session, persist the resulting video on the
 * product, invalidate the product query, and route GOOGLE_OAUTH_REQUIRED vs
 * other failures to the right feedback. Used by both the cameras-screen
 * stream dialog and the product-page camera-stream picker.
 */
export async function startYouTubeStreamFlow({
  cameraId,
  cameraName,
  productId,
  productName,
  title,
  privacy,
  queryClient,
  setActiveStream,
  feedback,
}: {
  cameraId: string;
  cameraName: string;
  productId: number;
  productName: string;
  title: string;
  privacy: YouTubePrivacyStatus;
  queryClient: QueryClient;
  setActiveStream: SetActiveStream;
  feedback: FeedbackApi;
}): Promise<boolean> {
  try {
    const trimmedTitle = title.trim();
    const result = await startYouTubeStream(cameraId, {
      product_id: productId,
      title: trimmedTitle || undefined,
      privacy_status: privacy,
    });
    setActiveStream({
      cameraId,
      cameraName,
      productId,
      productName,
      startedAt: result.started_at,
      youtubeUrl: result.url,
    });
    // The broadcast is already live at this point, so a failure to persist the
    // video is surfaced but does not fail the flow.
    try {
      await addProductVideo(productId, {
        url: result.url,
        title: trimmedTitle || 'Live stream',
        description: '',
      });
    } catch (err) {
      showStreamVideoSaveFailed(feedback, err);
    }
    invalidateProductQuery(queryClient, productId);
    return true;
  } catch (err) {
    if (err instanceof ApiError && err.code === 'GOOGLE_OAUTH_REQUIRED') {
      showGoogleAccountRequired(feedback);
    } else if (err instanceof ApiError && err.code === 'STREAM_ALREADY_ACTIVE') {
      showStreamAlreadyLive(feedback, cameraName);
    } else {
      showStreamStartFailed(feedback, err);
    }
    return false;
  }
}

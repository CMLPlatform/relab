import type { useAppFeedback } from '@/hooks/useAppFeedback';
import { getErrorMessage } from '@/utils/errors';

/** The subset of the app feedback API these YouTube stream helpers use. */
export type FeedbackApi = Pick<ReturnType<typeof useAppFeedback>, 'alert' | 'error' | 'toast'>;

export function showGoogleAccountRequired(feedback: FeedbackApi) {
  feedback.alert({
    title: 'Google account required',
    message: 'Connect your Google account in Profile > Linked Accounts to stream to YouTube.',
    buttons: [{ text: 'OK' }],
  });
}

export function showStreamAlreadyLive(feedback: FeedbackApi, cameraName: string) {
  feedback.alert({
    title: 'Already live',
    message: `${cameraName} is already streaming. Stop the current stream before starting a new one.`,
    buttons: [{ text: 'OK' }],
  });
}

export function showStreamStartFailed(feedback: FeedbackApi, error: unknown) {
  feedback.error(
    `Failed to start stream: ${getErrorMessage(error, String(error))}`,
    'Stream start failed',
  );
}

export function showStreamStopFailed(feedback: FeedbackApi, error: unknown) {
  feedback.error(`Failed to stop stream: ${getErrorMessage(error, String(error))}`, 'Stop failed');
}

/**
 * The broadcast started but attaching it to the product failed. The stream is
 * live either way, so this is a distinct, non-fatal message.
 */
export function showStreamVideoSaveFailed(feedback: FeedbackApi, error: unknown) {
  feedback.error(
    `The stream is live, but saving it to the product failed: ${getErrorMessage(error, String(error))}`,
    'Video not saved',
  );
}

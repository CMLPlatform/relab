export type FeedbackApi = {
  alert: (options: {
    title?: string;
    message?: string;
    buttons?: { text: string; onPress?: () => void }[];
  }) => void;
  error: (message: string, title?: string) => void;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function showGoogleAccountRequired(feedback: FeedbackApi) {
  feedback.alert({
    title: 'Google account required',
    message: 'Connect your Google account in Profile > Linked Accounts to stream to YouTube.',
    buttons: [{ text: 'OK' }],
  });
}

export function showStreamStartFailed(feedback: FeedbackApi, error: unknown) {
  feedback.error(`Failed to start stream: ${getErrorMessage(error)}`, 'Stream start failed');
}

export function showStreamStopFailed(feedback: FeedbackApi, error: unknown) {
  feedback.error(`Failed to stop stream: ${getErrorMessage(error)}`, 'Stop failed');
}

export function showStreamLinkRequired(feedback: FeedbackApi) {
  showGoogleAccountRequired(feedback);
}

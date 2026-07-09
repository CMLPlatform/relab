import { describe, expect, it, jest } from '@jest/globals';
import {
  showGoogleAccountRequired,
  showStreamStartFailed,
  showStreamStopFailed,
  showStreamVideoSaveFailed,
} from '@/components/cameras/streamingFeedback';

describe('streamingFeedback', () => {
  const feedback = {
    alert: jest.fn(),
    error: jest.fn(),
    toast: jest.fn(),
  };

  it('shows the Google account required dialog', () => {
    showGoogleAccountRequired(feedback);

    expect(feedback.alert).toHaveBeenCalledWith({
      title: 'Google account required',
      message: 'Connect your Google account in Profile > Linked Accounts to stream to YouTube.',
      buttons: [{ text: 'OK' }],
    });
  });

  it('formats stream start and stop failures', () => {
    showStreamStartFailed(feedback, new Error('boom'));
    showStreamStopFailed(feedback, 'nope');

    expect(feedback.error).toHaveBeenNthCalledWith(
      1,
      'Failed to start stream: boom',
      'Stream start failed',
    );
    expect(feedback.error).toHaveBeenNthCalledWith(2, 'Failed to stop stream: nope', 'Stop failed');
  });

  it('formats a failure to save the stream video', () => {
    showStreamVideoSaveFailed(feedback, new Error('disk full'));

    expect(feedback.error).toHaveBeenCalledWith(
      'The stream is live, but saving it to the product failed: disk full',
      'Video not saved',
    );
  });
});

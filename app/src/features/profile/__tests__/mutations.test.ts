import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { confirmOAuthUnlink } from '@/features/profile/mutations';
import { unlinkOAuth } from '@/services/api/auth/authentication';

jest.mock('@/services/api/auth/authentication', () => ({
  unlinkOAuth: jest.fn(),
  updateUser: jest.fn(),
  verify: jest.fn(),
}));

const mockUnlink = unlinkOAuth as jest.Mock<typeof unlinkOAuth>;

function makeArgs(overrides: Partial<Parameters<typeof confirmOAuthUnlink>[0]> = {}) {
  const feedback = { alert: jest.fn(), error: jest.fn(), toast: jest.fn() };
  return {
    provider: 'google',
    youtubeEnabled: false,
    setYoutubeEnabled: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    closeUnlinkDialog: jest.fn(),
    refetch: jest.fn<() => Promise<unknown>>().mockResolvedValue(undefined),
    feedback,
    ...overrides,
  } as unknown as Parameters<typeof confirmOAuthUnlink>[0] & {
    feedback: typeof feedback;
    setYoutubeEnabled: jest.Mock;
    closeUnlinkDialog: jest.Mock;
    refetch: jest.Mock;
  };
}

describe('confirmOAuthUnlink', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUnlink.mockResolvedValue(true);
  });

  it('unlinks, closes the dialog and refetches', async () => {
    const args = makeArgs();

    await confirmOAuthUnlink(args);

    expect(mockUnlink).toHaveBeenCalledWith('google', undefined);
    expect(args.closeUnlinkDialog).toHaveBeenCalled();
    expect(args.refetch).toHaveBeenCalled();
    expect(args.feedback.error).not.toHaveBeenCalled();
  });

  it('forwards the current password for step-up re-auth', async () => {
    const args = makeArgs({ currentPassword: 'my-password' });

    await confirmOAuthUnlink(args);

    expect(mockUnlink).toHaveBeenCalledWith('google', 'my-password');
  });

  // Regression: unlinking Google while YouTube streaming was on left YouTube
  // enabled against an account with no Google link. Untested until now.
  it('turns YouTube streaming off when unlinking Google', async () => {
    const args = makeArgs({ provider: 'google', youtubeEnabled: true });

    await confirmOAuthUnlink(args);

    expect(args.setYoutubeEnabled).toHaveBeenCalledWith(false);
  });

  it('leaves YouTube alone when unlinking a different provider', async () => {
    const args = makeArgs({ provider: 'github', youtubeEnabled: true });

    await confirmOAuthUnlink(args);

    expect(args.setYoutubeEnabled).not.toHaveBeenCalled();
  });

  it('reports a failed unlink and does not refetch', async () => {
    mockUnlink.mockRejectedValue(new Error('nope') as never);
    const args = makeArgs();

    await confirmOAuthUnlink(args);

    expect(args.feedback.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to disconnect'),
      'Disconnect failed',
    );
    expect(args.refetch).not.toHaveBeenCalled();
  });

  // Regression: a failure in the YouTube cascade used to be reported as
  // "Failed to disconnect", contradicting a server that had already unlinked.
  it('does not claim the disconnect failed when only the YouTube cascade fails', async () => {
    const args = makeArgs({
      provider: 'google',
      youtubeEnabled: true,
      setYoutubeEnabled: jest.fn<() => Promise<void>>().mockRejectedValue(new Error('boom')),
    });

    await confirmOAuthUnlink(args);

    expect(args.feedback.error).toHaveBeenCalledWith(
      expect.stringContaining('Google was disconnected'),
      'YouTube still enabled',
    );
    // The unlink really happened, so the dialog closes and the profile refetches.
    expect(args.closeUnlinkDialog).toHaveBeenCalled();
    expect(args.refetch).toHaveBeenCalled();
  });
});

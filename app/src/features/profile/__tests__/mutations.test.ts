import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  confirmOAuthUnlink,
  sendVerificationEmail,
  updateProfilePreferenceField,
  updateProfileUsername,
} from '@/features/profile/mutations';
import { unlinkOAuth, updateUser, verify } from '@/services/api/auth/authentication';

jest.mock('@/services/api/auth/authentication', () => ({
  unlinkOAuth: jest.fn(),
  updateUser: jest.fn(),
  verify: jest.fn(),
}));

const mockUnlink = unlinkOAuth as jest.Mock<typeof unlinkOAuth>;
const mockUpdateUser = updateUser as jest.Mock<typeof updateUser>;
const mockVerify = verify as jest.Mock<typeof verify>;

function makeFeedback() {
  return { alert: jest.fn(), error: jest.fn(), toast: jest.fn() };
}

function makeRefetch() {
  return jest.fn<(forceRefresh?: boolean) => Promise<unknown>>().mockResolvedValue(undefined);
}

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

describe('sendVerificationEmail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('confirms by toast when the send succeeds', async () => {
    mockVerify.mockResolvedValue(true);
    const feedback = makeFeedback();

    await sendVerificationEmail({ email: 'a@b.com', feedback: feedback as never });

    expect(mockVerify).toHaveBeenCalledWith('a@b.com');
    expect(feedback.toast).toHaveBeenCalledWith(
      'Verification email sent. Please check your inbox.',
    );
    expect(feedback.error).not.toHaveBeenCalled();
  });

  // A falsy return is a refusal, not a success — reporting it as sent leaves the
  // user waiting for an email that never arrives.
  it('reports failure when the endpoint refuses without throwing', async () => {
    mockVerify.mockResolvedValue(false);
    const feedback = makeFeedback();

    await sendVerificationEmail({ email: 'a@b.com', feedback: feedback as never });

    expect(feedback.toast).not.toHaveBeenCalled();
    expect(feedback.error).toHaveBeenCalledWith(expect.any(String), 'Verification failed');
  });

  it('reports failure when the request throws', async () => {
    mockVerify.mockRejectedValue(new Error('network'));
    const feedback = makeFeedback();

    await expect(
      sendVerificationEmail({ email: 'a@b.com', feedback: feedback as never }),
    ).resolves.toBeUndefined();
    expect(feedback.error).toHaveBeenCalledWith(expect.any(String), 'Verification failed');
  });
});

describe('updateProfileUsername', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateUser.mockResolvedValue(undefined);
  });

  // Client-side gate before the request: a one-character username is rejected
  // by the server too, but without a round trip the user sees why immediately.
  it('rejects a username under two characters without calling the API', async () => {
    const feedback = makeFeedback();
    const refetch = makeRefetch();

    await updateProfileUsername({ username: 'a', feedback: feedback as never, refetch });

    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(refetch).not.toHaveBeenCalled();
    expect(feedback.error).toHaveBeenCalledWith(expect.any(String), 'Invalid username');
  });

  it('saves, refetches and confirms', async () => {
    const feedback = makeFeedback();
    const refetch = makeRefetch();

    await updateProfileUsername({ username: 'newname', feedback: feedback as never, refetch });

    expect(mockUpdateUser).toHaveBeenCalledWith({ username: 'newname' });
    expect(refetch).toHaveBeenCalledWith(false);
    expect(feedback.toast).toHaveBeenCalledWith('Username updated.');
  });

  // Username collisions are the common case here, so the server's message has to
  // reach the user rather than a generic failure.
  it('surfaces the server message on failure', async () => {
    mockUpdateUser.mockRejectedValue(new Error('Username already taken'));
    const feedback = makeFeedback();

    await updateProfileUsername({
      username: 'taken',
      feedback: feedback as never,
      refetch: makeRefetch(),
    });

    expect(feedback.error).toHaveBeenCalledWith(
      'Failed to update username: Username already taken',
      'Update failed',
    );
  });
});

describe('updateProfilePreferenceField', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateUser.mockResolvedValue(undefined);
  });

  // Only the changed key is sent; the server merges with `exclude_unset`, so a
  // full preferences object here would clobber the other fields.
  it('sends only the changed key', async () => {
    const refetch = makeRefetch();

    await updateProfilePreferenceField({
      field: 'profile_visibility',
      value: 'community',
      feedback: makeFeedback() as never,
      refetch,
    });

    expect(mockUpdateUser).toHaveBeenCalledWith({
      preferences: { profile_visibility: 'community' },
    });
    expect(refetch).toHaveBeenCalledWith(false);
  });

  it('phrases the email-updates confirmation by the new value', async () => {
    const on = makeFeedback();
    await updateProfilePreferenceField({
      field: 'email_updates_enabled',
      value: true,
      feedback: on as never,
      refetch: makeRefetch(),
    });
    expect(on.toast).toHaveBeenCalledWith('Email updates enabled.');

    const off = makeFeedback();
    await updateProfilePreferenceField({
      field: 'email_updates_enabled',
      value: false,
      feedback: off as never,
      refetch: makeRefetch(),
    });
    expect(off.toast).toHaveBeenCalledWith('Email updates disabled.');
  });

  it('titles the failure by field', async () => {
    mockUpdateUser.mockRejectedValue(new Error('boom'));
    const feedback = makeFeedback();

    await updateProfilePreferenceField({
      field: 'profile_visibility',
      value: 'private',
      feedback: feedback as never,
      refetch: makeRefetch(),
    });

    expect(feedback.error).toHaveBeenCalledWith(
      'Failed to update visibility: boom',
      'Visibility update failed',
    );
  });
});

import { describe, expect, it } from '@jest/globals';
import { ApiError, throwFromResponse } from '@/services/api/errors';
import { getErrorMessage } from '@/utils/errors';

describe('getErrorMessage', () => {
  it('maps a network TypeError to a plain-language message', () => {
    expect(getErrorMessage(new TypeError('Failed to fetch'), 'fb')).toBe(
      "Can't reach Relab. Check your connection and try again.",
    );
  });

  it('maps server errors to a fixed message', () => {
    expect(getErrorMessage(new ApiError('boom', 502), 'fb')).toBe(
      'Relab had a problem on its side. Try again in a moment.',
    );
  });

  it('passes client-error messages through', () => {
    expect(getErrorMessage(new ApiError('Name taken', 409), 'fb')).toBe('Name taken');
  });

  it('passes deliberate plain Error copy through', () => {
    expect(getErrorMessage(new Error('Upload too large'), 'fb')).toBe('Upload too large');
  });

  it('falls back for an empty message or a non-Error', () => {
    expect(getErrorMessage(new Error(''), 'fb')).toBe('fb');
    expect(getErrorMessage('x', 'fb')).toBe('fb');
  });
});

describe('throwFromResponse', () => {
  it('uses the fallback verbatim when the body has no detail', async () => {
    const resp = { status: 502, json: async () => ({}) } as Response;
    await expect(throwFromResponse(resp, 'Could not save')).rejects.toMatchObject({
      message: 'Could not save',
      status: 502,
    });
  });
});

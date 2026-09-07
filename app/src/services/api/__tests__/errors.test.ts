import { describe, expect, it } from '@jest/globals';
import { ApiError, parseApiErrorDetail, throwFromResponse } from '@/services/api/errors';

describe('parseApiErrorDetail', () => {
  it('reads a plain string detail', () => {
    expect(parseApiErrorDetail({ detail: 'Too many login attempts.' })).toBe(
      'Too many login attempts.',
    );
  });

  it('reads the msg of a FastAPI validation array', () => {
    expect(parseApiErrorDetail({ detail: [{ msg: 'field required', loc: ['body'] }] })).toBe(
      'field required',
    );
  });

  // Regression: only `detail[0].msg` was read, so a plain string array fell
  // through to the caller's generic fallback and hid the server's message.
  it('reads a detail array of plain strings', () => {
    expect(parseApiErrorDetail({ detail: ['Rate limit exceeded'] })).toBe('Rate limit exceeded');
  });

  it('reads a nested message or reason object', () => {
    expect(parseApiErrorDetail({ detail: { message: 'nope' } })).toBe('nope');
    expect(parseApiErrorDetail({ detail: { reason: 'because' } })).toBe('because');
  });

  it.each([
    ['null body', null],
    ['non-object body', 'oops'],
    ['missing detail', {}],
    ['empty array', { detail: [] }],
    ['array of empty objects', { detail: [{}] }],
    ['empty string detail', { detail: '' }],
  ])('returns undefined for %s', (_label, body) => {
    expect(parseApiErrorDetail(body)).toBeUndefined();
  });
});

describe('throwFromResponse', () => {
  it('throws an ApiError carrying the server detail, status and code', async () => {
    const response = {
      status: 409,
      json: async () => ({ detail: 'Already streaming', code: 'STREAM_ALREADY_ACTIVE' }),
    } as unknown as Response;

    await expect(throwFromResponse(response, 'Failed')).rejects.toThrow('Already streaming');
    await expect(throwFromResponse(response, 'Failed')).rejects.toMatchObject({
      name: 'ApiError',
      status: 409,
      code: 'STREAM_ALREADY_ACTIVE',
    });
  });

  it('falls back to "<fallback> (status)" when the body has no usable detail', async () => {
    const response = { status: 500, json: async () => ({}) } as unknown as Response;

    await expect(throwFromResponse(response, 'Failed to start stream')).rejects.toThrow(
      'Failed to start stream (500)',
    );
  });

  it('survives a body that is not JSON', async () => {
    const response = {
      status: 502,
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
    } as unknown as Response;

    await expect(throwFromResponse(response, 'Bad gateway')).rejects.toThrow('Bad gateway (502)');
  });

  it('survives a response with no json method', async () => {
    const response = { status: 504 } as unknown as Response;

    await expect(throwFromResponse(response, 'Timeout')).rejects.toBeInstanceOf(ApiError);
  });
});

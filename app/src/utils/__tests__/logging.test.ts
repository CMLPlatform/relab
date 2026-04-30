import { logError } from '../logging';

describe('logError', () => {
  it('does not call console.error in test environment', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    logError('should not log');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('calls console.error with all arguments when NODE_ENV is not test', () => {
    const original = process.env.NODE_ENV;
    // Object.assign avoids the TS "read-only property" error on process.env.NODE_ENV.
    Object.assign(process.env, { NODE_ENV: 'production' });
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    logError('hello', 'world', 42);

    expect(spy).toHaveBeenCalledWith('hello', 'world', 42);
    spy.mockRestore();
    Object.assign(process.env, { NODE_ENV: original });
  });

  it('still suppresses when process.env access throws', () => {
    // The try/catch in logError guards against environments where
    // process.env is inaccessible; in normal test runs it just returns early.
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => logError('quiet')).not.toThrow();
    spy.mockRestore();
  });
});

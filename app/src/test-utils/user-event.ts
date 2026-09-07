import { jest } from '@jest/globals';
import { userEvent } from '@testing-library/react-native';

/**
 * Creates a userEvent instance configured for the test environment.
 *
 * Since fake timers are enabled globally, this wires up `advanceTimers`
 * so that userEvent's internal delays resolve correctly.
 */
export function setupUser() {
  return userEvent.setup({ advanceTimers: jest.advanceTimersByTimeAsync });
}

import { describe, expect, test } from '@jest/globals';
import { ACCOUNT_SECTIONS } from '@/features/profile/accountSections';

describe('ACCOUNT_SECTIONS', () => {
  test('defines the five account groups in spec order', () => {
    expect(ACCOUNT_SECTIONS.map((section) => section.key)).toEqual([
      'profile',
      'preferences',
      'integrations',
      'security',
      'danger',
    ]);
  });

  test('labels are sentence case and danger zone is last', () => {
    expect(ACCOUNT_SECTIONS.map((section) => section.label)).toEqual([
      'Profile',
      'Preferences',
      'Integrations',
      'Security & sessions',
      'Danger zone',
    ]);
    expect(ACCOUNT_SECTIONS.at(-1)?.key).toBe('danger');
  });
});

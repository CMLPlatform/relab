import { describe, expect, jest, test } from '@jest/globals';
import { render } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { IosAnnouncement } from '@/components/base/IosAnnouncement';
import { mockPlatform, restorePlatform } from '@/test-utils';

describe('IosAnnouncement', () => {
  test('announces on mount and on change by default', async () => {
    mockPlatform('ios');
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
    const view = await render(<IosAnnouncement text="first" />);
    await view.rerender(<IosAnnouncement text="second" />);
    expect(announce.mock.calls).toEqual([['first'], ['second']]);
    announce.mockRestore();
    restorePlatform();
  });

  test('with skipInitial, stays quiet on mount like a live region', async () => {
    mockPlatform('ios');
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
    const view = await render(<IosAnnouncement text="20 of 40 products" skipInitial />);
    expect(announce).not.toHaveBeenCalled();
    await view.rerender(<IosAnnouncement text="40 of 40 products" skipInitial />);
    expect(announce).toHaveBeenCalledWith('40 of 40 products');
    announce.mockRestore();
    restorePlatform();
  });

  test('does nothing off iOS', async () => {
    mockPlatform('android');
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
    await render(<IosAnnouncement text="hello" />);
    expect(announce).not.toHaveBeenCalled();
    announce.mockRestore();
    restorePlatform();
  });
});

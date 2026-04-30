import { describe, expect, it, jest } from '@jest/globals';
import { openURL } from 'expo-linking';

import { openExternalUrl } from '@/services/externalLinks';

const openUrlMock = openURL as jest.MockedFunction<typeof openURL>;

jest.mock('expo-linking', () => ({
  __esModule: true,
  openURL: require('@jest/globals').jest.fn(),
}));

describe('openExternalUrl', () => {
  it('opens only http URLs', async () => {
    openUrlMock.mockResolvedValue(true);

    await expect(openExternalUrl('https://example.com')).resolves.toBe(true);
    await expect(openExternalUrl('mailto:relab@cml.leidenuniv.nl')).resolves.toBe(false);
    await expect(openExternalUrl('javascript:alert(1)')).resolves.toBe(false);
    await expect(openExternalUrl('data:text/html,<script>alert(1)</script>')).resolves.toBe(false);
    await expect(openExternalUrl('https://')).resolves.toBe(false);

    expect(openUrlMock).toHaveBeenCalledWith('https://example.com/');
    expect(openUrlMock).not.toHaveBeenCalledWith('mailto:relab@cml.leidenuniv.nl');
    expect(openUrlMock).not.toHaveBeenCalledWith('javascript:alert(1)');
  });
});

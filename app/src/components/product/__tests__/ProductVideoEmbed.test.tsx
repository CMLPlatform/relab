import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { VideoEmbed } from '@/components/product/ProductVideoEmbed';
import { mockPlatform, restorePlatform } from '@/test-utils';
import { getHostByType, queryAllHostsByType } from '@/test-utils/index';

jest.mock('@/services/externalLinks', () => ({
  openExternalUrl: jest.fn(),
}));

jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    WebView: (props: Record<string, unknown>) =>
      React.createElement(View, { testID: 'mock-webview', ...props }),
  };
});

const URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const EMBED = 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ';

async function renderLoaded() {
  await render(<VideoEmbed url={URL} linkColor="#000" />);
  // Click-to-load: nothing third-party is fetched until the user asks for it.
  await fireEvent.press(screen.getByText('Load video'));
}

function iframe() {
  return getHostByType('iframe');
}

afterEach(restorePlatform);

describe('VideoEmbed — web iframe sandbox', () => {
  it('frames the nocookie embed host, never the watch URL', async () => {
    mockPlatform('web');
    await renderLoaded();

    expect(iframe().props.src).toBe(EMBED);
  });

  // The frame runs third-party YouTube script. Widening this sandbox (in
  // particular adding allow-popups-to-escape-sandbox or allow-top-navigation)
  // hands that script the parent page.
  it('pins the sandbox allowlist and withholds the referrer', async () => {
    mockPlatform('web');
    await renderLoaded();

    expect(iframe().props.sandbox.split(' ').sort()).toEqual([
      'allow-popups',
      'allow-presentation',
      'allow-same-origin',
      'allow-scripts',
    ]);
    expect(iframe().props.referrerPolicy).toBe('no-referrer');
  });

  it('names the frame for screen readers', async () => {
    mockPlatform('web');
    await renderLoaded();

    expect(iframe().props.title).toBe('Embedded product video');
  });
});

describe('VideoEmbed — native WebView', () => {
  it('whitelists only the nocookie origin, so an in-frame link cannot navigate away', async () => {
    mockPlatform('ios');
    await renderLoaded();

    const webview = screen.getByTestId('mock-webview');
    expect(webview.props.originWhitelist).toEqual(['https://www.youtube-nocookie.com']);
    expect(webview.props.source).toEqual({ uri: EMBED });
  });
});

describe('VideoEmbed — non-YouTube URLs', () => {
  it('renders a plain link rather than framing an arbitrary origin', async () => {
    mockPlatform('web');
    await render(<VideoEmbed url="https://example.com/clip.mp4" linkColor="#000" />);

    expect(screen.getByText('https://example.com/clip.mp4')).toBeOnTheScreen();
    expect(screen.queryByText('Load video')).toBeNull();
    expect(queryAllHostsByType('iframe')).toHaveLength(0);
  });
});
